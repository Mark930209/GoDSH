// Compare cache-hit rates across the plugin enable boundary.
// Usage: node scripts/_cache_window.mjs <session.v4.jsonl.zstd> [more...]
import fs from 'node:fs';
import zlib from 'node:zlib';

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
// The restart that activated the outbound rewrite (local Asia/Shanghai).
const BOUNDARY = new Date('2026-11-05T16:24:53+08:00').getTime();

function readSession(file) {
  const buf = fs.readFileSync(file);
  const offsets = [];
  for (let i = 0; i < buf.length - 3; i += 1) {
    if (MAGIC.every((b, k) => buf[i + k] === b)) offsets.push(i);
  }
  let text = '';
  for (let k = 0; k < offsets.length; k += 1) {
    const start = offsets[k];
    const end = k + 1 < offsets.length ? offsets[k + 1] : buf.length;
    try {
      text += zlib.zstdDecompressSync(buf.subarray(start, end)).toString('utf8');
    } catch {
      /* skip */
    }
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

for (const file of process.argv.slice(2)) {
  const events = readSession(file);
  let route = '?';
  let toolCount = -1;
  const groups = new Map();
  for (const event of events) {
    if (event.type === 'request/header') {
      const config = event.data?.header?.config ?? {};
      route = `${config.provider ?? '?'}/${config.model ?? '?'}`;
      toolCount = (event.data?.header?.tools ?? []).length;
      continue;
    }
    if (event.type !== 'assistant/message') continue;
    const usage = event.data?.usage;
    if (!usage) continue;
    const prompt = Number(usage.inputTokens ?? 0) + Number(usage.cacheReadTokens ?? 0);
    if (prompt <= 0) continue;
    const before = event.time < BOUNDARY;
    const key = `${before ? 'before 16:24' : 'after  16:24'}  ${route}  headerTools=${toolCount}`;
    const group = groups.get(key) ?? { n: 0, prompt: 0, cached: 0, rates: [] };
    group.n += 1;
    group.prompt += prompt;
    group.cached += Number(usage.cacheReadTokens ?? 0);
    group.rates.push((100 * Number(usage.cacheReadTokens ?? 0)) / prompt);
    groups.set(key, group);
  }
  console.log(`\n=== ${file}`);
  for (const [key, group] of [...groups.entries()].sort()) {
    const avg = group.rates.reduce((a, b) => a + b, 0) / group.rates.length;
    const tokenWeighted = (100 * group.cached) / group.prompt;
    const high = group.rates.filter((rate) => rate > 80).length;
    const zero = group.rates.filter((rate) => rate < 5).length;
    console.log(
      `  ${key}\n    n=${String(group.n).padStart(4)}  avg ${avg.toFixed(1).padStart(5)}%  token-weighted ${tokenWeighted.toFixed(1).padStart(5)}%` +
        `  >80%: ${String(high).padStart(4)}  <5%: ${String(zero).padStart(4)}  promptSum=${group.prompt}`
    );
  }
}
