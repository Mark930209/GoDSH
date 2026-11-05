// Find what changes in the request prefix where the cache rate collapses.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

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

const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 10);
const textOf = (content) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((block) => block?.type === 'text').map((block) => block.text ?? '').join('');
};

const events = readSession(process.argv[2]);
let systemHash = 'none';
let systemLen = 0;
let toolsKey = 'none';
const rows = [];

for (const event of events) {
  if (event.type === 'request/header') {
    const tools = event.data?.header?.tools ?? [];
    toolsKey = `${tools.length}:${hash(tools.map((tool) => tool.name).join(','))}`;
    continue;
  }
  if (event.type === 'system/message') {
    const text = textOf(event.data?.message?.content);
    systemHash = hash(text);
    systemLen = text.length;
    continue;
  }
  if (event.type !== 'assistant/message') continue;
  const usage = event.data?.usage;
  if (!usage) continue;
  const prompt = Number(usage.inputTokens ?? 0) + Number(usage.cacheReadTokens ?? 0);
  if (prompt <= 0) continue;
  rows.push({
    seq: event.seq,
    prompt,
    cached: Number(usage.cacheReadTokens ?? 0),
    rate: (Number(usage.cacheReadTokens ?? 0) / prompt) * 100,
    systemHash,
    systemLen,
    toolsKey
  });
}

console.log(`rows=${rows.length}`);
let previous = null;
for (const row of rows) {
  const broke = previous !== null && row.rate < 50 && previous.rate >= 80;
  const changed = [];
  if (previous !== null) {
    if (row.systemHash !== previous.systemHash) changed.push(`system ${previous.systemHash}(${previous.systemLen}) -> ${row.systemHash}(${row.systemLen})`);
    if (row.toolsKey !== previous.toolsKey) changed.push(`tools ${previous.toolsKey} -> ${row.toolsKey}`);
  }
  if (broke || changed.length > 0) {
    console.log(
      `seq ${String(row.seq).padStart(5)} rate ${row.rate.toFixed(1).padStart(5)}%  prompt ${row.prompt}` +
        (broke ? '  <<< COLLAPSE' : '') +
        (changed.length > 0 ? `\n     ${changed.join('\n     ')}` : '')
    );
  }
  previous = row;
}

const sysHashes = [...new Set(rows.map((row) => `${row.systemHash}/${row.systemLen}`))];
console.log(`\ndistinct system prompts: ${sysHashes.length}`);
for (const entry of sysHashes.slice(0, 12)) console.log(`  ${entry}`);
const toolKeys = [...new Set(rows.map((row) => row.toolsKey))];
console.log(`distinct tool sets: ${toolKeys.length}`);
for (const entry of toolKeys.slice(0, 12)) console.log(`  ${entry}`);
