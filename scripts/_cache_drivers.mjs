import fs from 'node:fs';
import zlib from 'node:zlib';

const p = process.argv[2];
const b = fs.readFileSync(p);
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const starts = [];
for (let i = 0; i <= b.length - 4; i += 1) if (b.compare(magic, 0, 4, i, i + 4) === 0) starts.push(i);
let text = '';
for (let k = 0; k < starts.length; k += 1) {
  const end = k + 1 < starts.length ? starts[k + 1] : b.length;
  try { text += zlib.zstdDecompressSync(b.subarray(starts[k], end)).toString('utf8'); } catch { /* partial */ }
}
const evs = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const rows = evs
  .filter((e) => e.type === 'assistant/message' && e.time !== undefined)
  .map((e) => {
    const u = e.data.usage ?? {};
    const cache = u.cacheReadTokens ?? 0;
    const input = u.inputTokens ?? 0;
    return { turn: e.data.turn, step: e.data.step, time: e.time, input, cache, total: input + cache };
  })
  .sort((a, b2) => a.time - b2.time);

for (let i = 0; i < rows.length; i += 1) {
  rows[i].gapMs = i === 0 ? null : rows[i].time - rows[i - 1].time;
  rows[i].rate = rows[i].total > 0 ? rows[i].cache / rows[i].total : 0;
}

const miss = (r) => r.rate < 0.05;
console.log('=== per-request overview ===');
console.log('requests:', rows.length, '| misses:', rows.filter(miss).length);

// Gap buckets: does a long pause correlate with a miss?
const buckets = [
  [0, 15000, '<15s'],
  [15000, 60000, '15-60s'],
  [60000, 300000, '1-5m'],
  [300000, 900000, '5-15m'],
  [900000, Infinity, '>15m']
];
console.log('\n=== miss rate by pause since previous request ===');
for (const [lo, hi, label] of buckets) {
  const subset = rows.filter((r) => r.gapMs !== null && r.gapMs >= lo && r.gapMs < hi);
  if (subset.length === 0) { console.log(`  ${label.padEnd(8)} n=0`); continue; }
  const m = subset.filter(miss).length;
  console.log(`  ${label.padEnd(8)} n=${String(subset.length).padStart(3)} miss=${String(m).padStart(3)} (${Math.round((m / subset.length) * 100)}%)`);
}

// Context size buckets: is the miss worse once the conversation is big?
const sizeBuckets = [
  [0, 30000, '<30k'],
  [30000, 60000, '30-60k'],
  [60000, 80000, '60-80k'],
  [80000, 100000, '80-100k'],
  [100000, Infinity, '>100k']
];
console.log('\n=== miss rate by context size (input+cache) ===');
for (const [lo, hi, label] of sizeBuckets) {
  const subset = rows.filter((r) => r.total >= lo && r.total < hi);
  if (subset.length === 0) { console.log(`  ${label.padEnd(8)} n=0`); continue; }
  const m = subset.filter(miss).length;
  console.log(`  ${label.padEnd(8)} n=${String(subset.length).padStart(3)} miss=${String(m).padStart(3)} (${Math.round((m / subset.length) * 100)}%)`);
}

// Is a miss followed by a hit or another miss?
let m2m = 0, m2h = 0, h2m = 0, h2h = 0;
for (let i = 1; i < rows.length; i += 1) {
  const prev = miss(rows[i - 1]);
  const cur = miss(rows[i]);
  if (prev && cur) m2m += 1;
  else if (prev && !cur) m2h += 1;
  else if (!prev && cur) h2m += 1;
  else h2h += 1;
}
console.log('\n=== transitions ===');
console.log(`  miss->miss ${m2m} | miss->hit ${m2h} | hit->miss ${h2m} | hit->hit ${h2h}`);
const pMiss = rows.filter(miss).length / rows.length;
console.log(`  unconditional miss rate: ${Math.round(pMiss * 100)}%`);
if (m2m + m2h > 0) console.log(`  P(miss | prev miss) = ${Math.round((m2m / (m2m + m2h)) * 100)}%`);
if (h2m + h2h > 0) console.log(`  P(miss | prev hit)  = ${Math.round((h2m / (h2m + h2h)) * 100)}%`);

// When a request DOES miss, how much of the prefix was still cached?
const partial = rows.filter((r) => r.rate > 0.05 && r.rate < 0.9);
console.log('\npartial hits (5-90%):', partial.length);
for (const r of partial.slice(0, 10)) console.log(`  turn ${r.turn} step ${r.step} ${Math.round(r.rate * 100)}%`);

// Print the sharpest alternating window verbatim.
console.log('\n=== turn 1 steps 36-44 verbatim ===');
for (const r of rows.filter((x) => x.turn === 1 && x.step >= 36 && x.step <= 44)) {
  console.log(
    `  step ${String(r.step).padStart(2)}`,
    `gap=${r.gapMs === null ? '-' : Math.round(r.gapMs / 1000) + 's'}`,
    `input=${r.input}`,
    `cached=${r.cache}`,
    `total=${r.total}`,
    `${Math.round(r.rate * 100)}%`
  );
}
