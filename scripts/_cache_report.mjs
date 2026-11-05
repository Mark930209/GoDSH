// Report prompt-cache behaviour for one or more session logs.
//
// Provider prompt caches are prefix caches: the useful question is not "did the
// last request hit the cache" but "does cache_read grow with the conversation".
// A native `tools` field pins the cache to the fixed header, so cache_read stops
// growing and every step re-bills the whole history. This script prints that
// curve per route so the text-catalog change can be judged on numbers.
//
// Usage: node scripts\_cache_report.mjs <session.v4.jsonl.zstd> [more...]
import fs from 'node:fs';
import zlib from 'node:zlib';

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

/** Split a concatenated-zstd file into decompressed JSONL text. */
function readSession(file) {
  const buf = fs.readFileSync(file);
  const offsets = [];
  for (let i = 0; i < buf.length - 3; i += 1) {
    if (MAGIC.every((byte, k) => buf[i + k] === byte)) offsets.push(i);
  }
  let text = '';
  for (let k = 0; k < offsets.length; k += 1) {
    const start = offsets[k];
    const end = k + 1 < offsets.length ? offsets[k + 1] : buf.length;
    try {
      text += zlib.zstdDecompressSync(buf.subarray(start, end)).toString('utf8');
    } catch {
      // A damaged frame must not hide the rest of the session.
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

/** Percentage of the prompt served from cache. */
const rate = (cached, prompt) => (prompt > 0 ? (cached / prompt) * 100 : 0);

/** One row per assistant message that reported usage. */
function steps(events) {
  let route = '?';
  let tools = 'none';
  const rows = [];
  for (const event of events) {
    if (event.type === 'request/header') {
      const config = event.data?.header?.config ?? {};
      route = `${config.provider ?? '?'}/${config.model ?? '?'}`;
      const count = event.data?.header?.tools?.length ?? 0;
      tools = count === 0 ? 'none' : String(count);
      continue;
    }
    if (event.type !== 'assistant/message') continue;
    const usage = event.data?.usage;
    if (usage === undefined || usage === null) continue;
    const prompt = Number(usage.inputTokens ?? 0) + Number(usage.cacheReadTokens ?? 0);
    const cached = Number(usage.cacheReadTokens ?? 0);
    if (prompt <= 0) continue;
    rows.push({
      seq: event.seq,
      route,
      tools,
      prompt,
      cached,
      rate: rate(cached, prompt),
      out: Number(usage.outputTokens ?? 0)
    });
  }
  return rows;
}

/** Compact summary for a set of rows. */
function summarise(rows) {
  if (rows.length === 0) return 'no usage rows';
  const prompt = rows.reduce((sum, row) => sum + row.prompt, 0);
  const cached = rows.reduce((sum, row) => sum + row.cached, 0);
  return `steps=${rows.length} prompt=${prompt} cache_read=${cached} overall=${rate(cached, prompt).toFixed(1)}%`;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts\\_cache_report.mjs <session.v4.jsonl.zstd> [more...]');
  process.exit(2);
}

for (const file of files) {
  const rows = steps(readSession(file));
  console.log(`\n=== ${file}`);
  console.log(summarise(rows));

  // One line per (route, tools) pair: the point is whether the rate climbs.
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.route}  tools=${row.tools}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const [key, group] of groups) {
    console.log(`\n-- ${key}`);
    console.log(`   ${summarise(group)}`);
    for (const row of group.slice(-12)) {
      console.log(
        `   seq ${String(row.seq).padStart(5)}  prompt ${String(row.prompt).padStart(7)}` +
          `  cache_read ${String(row.cached).padStart(7)}  ${row.rate.toFixed(1).padStart(5)}%  out ${row.out}`
      );
    }
  }
}
