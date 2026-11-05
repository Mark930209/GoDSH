// Correlate cache-rate collapses with the events that could break the prefix.
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

const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);

const events = readSession(process.argv[2]);
/** Events that can change what the model sees. */
const INTERESTING = new Set(['request/header', 'compaction/prune', 'agent/inbox/spliced', 'goal/change', 'request/context']);

let headerKey = 'none';
const marks = new Map();
for (const event of events) {
  if (event.type === 'request/header') {
    const header = event.data?.header ?? {};
    const tools = header.tools ?? [];
    headerKey = `${tools.length}/${hash(JSON.stringify(tools.map((tool) => tool.name)))}`;
    const previous = marks.get('header')?.key;
    if (previous !== headerKey) marks.set(`header@${event.seq}`, { key: headerKey, seq: event.seq });
    marks.set('header', { key: headerKey, seq: event.seq });
    continue;
  }
  if (INTERESTING.has(event.type)) marks.set(`${event.type}@${event.seq}`, { seq: event.seq });
}

const rows = [];
let currentHeader = 'none';
let lastHeaderSeq = null;
for (const event of events) {
  if (event.type === 'request/header') {
    currentHeader = hash(JSON.stringify((event.data?.header?.tools ?? []).map((tool) => tool.name)));
    lastHeaderSeq = event.seq;
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
    rate: (Number(usage.cacheReadTokens ?? 0) / prompt) * 100,
    header: currentHeader,
    headerSeq: lastHeaderSeq,
    marks: [...marks.values()].filter((mark) => mark.seq <= event.seq).slice(-3)
  });
}

console.log(`rows=${rows.length}`);
let previous = null;
for (const row of rows) {
  const collapse = previous !== null && row.rate < 50 && previous.rate >= 80;
  if (collapse) {
    const since = row.seq - (row.headerSeq ?? 0);
    console.log(
      `\nseq ${row.seq}  ${previous.rate.toFixed(1)}% -> ${row.rate.toFixed(1)}%  prompt ${row.prompt}` +
        `\n   last header at seq ${row.headerSeq} (${since} events ago), header hash ${row.header}`
    );
    const recent = events.filter((event) => event.seq <= row.seq && event.seq > row.seq - 40);
    const tail = [...new Set(recent.map((event) => event.type))].slice(-8);
    console.log(`   recent event types: ${tail.join(', ')}`);
  }
  previous = row;
}

const rates = rows.map((row) => row.rate);
const low = rates.filter((value) => value < 50).length;
console.log(`\nsteps below 50%: ${low}/${rates.length}`);
const headerKeys = [...new Set(rows.map((row) => row.header))];
console.log(`distinct tool-name sets during the session: ${headerKeys.length}`);
