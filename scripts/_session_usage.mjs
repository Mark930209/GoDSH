import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const buf = fs.readFileSync(file);
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const offsets = [];
for (let i = 0; i + 4 <= buf.length; i++) {
  if (buf[i] === 0x28 && buf[i+1] === 0xb5 && buf[i+2] === 0x2f && buf[i+3] === 0xfd) offsets.push(i);
}
if (offsets[0] !== 0) offsets.unshift(0);
offsets.push(buf.length);
const events = [];
let failures = 0;
let start = offsets[0];
for (let k = 1; k < offsets.length; k++) {
  const end = offsets[k];
  try {
    const out = zlib.zstdDecompressSync(buf.subarray(start, end)).toString('utf8');
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      events.push(JSON.parse(line));
    }
    start = end;
  } catch {
    failures++;
    // not a real boundary; extend current segment
  }
}
console.error(`# frames=${offsets.length - 1} events=${events.length} boundaryFailures=${failures}`);
const types = new Map();
for (const e of events) { const t = e.type || '?'; types.set(t, (types.get(t) || 0) + 1); }
console.error('# types:');
for (const [k, v] of [...types.entries()].sort((a, b) => b[1] - a[1])) console.error(`  ${v}\t${k}`);

const usage = [];
for (const e of events) {
  const s = JSON.stringify(e);
  if (/cacheReadTokens|cacheWriteTokens/.test(s)) usage.push(e);
}
console.error('# usage events:', usage.length);
for (const e of usage.slice(0, 5)) console.error(JSON.stringify(e).slice(0, 900));
fs.writeFileSync(process.env.OUT || 'scratch_events.jsonl', events.map(e => JSON.stringify(e)).join('\n'));
