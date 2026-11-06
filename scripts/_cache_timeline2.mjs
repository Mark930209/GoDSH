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

// Group into 5-minute wall-clock buckets to separate "time" from "size".
console.log('=== hit rate by 5-minute wall-clock bucket ===');
const buckets = new Map();
for (const r of rows) {
  const key = new Date(Math.floor(r.time / 300000) * 300000).toISOString().slice(11, 16);
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(r);
}
for (const [key, list] of [...buckets.entries()].sort()) {
  const hit = list.filter((r) => r.cache / Math.max(1, r.total) >= 0.5).length;
  const size = Math.round(list.reduce((a, c) => a + c.total, 0) / list.length);
  const turns = [...new Set(list.map((r) => r.turn))].join(',');
  console.log(`  ${key}Z n=${String(list.length).padStart(2)} hit=${String(hit).padStart(2)} (${String(Math.round((hit / list.length) * 100)).padStart(3)}%) avgCtx=${String(size).padStart(6)} turns=${turns}`);
}

// Same rows, but ordered by size within each turn - does size predict the miss
// once time is held roughly fixed?
console.log('\n=== per-turn hit rate (holds time roughly fixed) ===');
const byTurn = new Map();
for (const r of rows) {
  if (!byTurn.has(r.turn)) byTurn.set(r.turn, []);
  byTurn.get(r.turn).push(r);
}
for (const [turn, list] of [...byTurn.entries()].sort((a, b2) => a[0] - b2[0])) {
  const hit = list.filter((r) => r.cache / Math.max(1, r.total) >= 0.5).length;
  const sorted = [...list].sort((a, b2) => a.total - b2.total);
  const smallHalf = sorted.slice(0, Math.floor(sorted.length / 2));
  const bigHalf = sorted.slice(Math.floor(sorted.length / 2));
  const rate = (arr) => arr.length === 0 ? '-' : Math.round((arr.filter((r) => r.cache / Math.max(1, r.total) >= 0.5).length / arr.length) * 100) + '%';
  console.log(`  turn ${String(turn).padStart(2)} n=${String(list.length).padStart(3)} hit=${String(Math.round((hit / list.length) * 100)).padStart(3)}% | smaller half ${rate(smallHalf).padStart(4)} | bigger half ${rate(bigHalf).padStart(4)}`);
}

// First request time and how the very first minute looks.
console.log('\n=== first 3 minutes, request by request ===');
const t0 = rows[0].time;
for (const r of rows.filter((x) => x.time - t0 < 180000)) {
  const pct = Math.round((r.cache / Math.max(1, r.total)) * 100);
  console.log(`  +${String(Math.round((r.time - t0) / 1000)).padStart(4)}s turn ${r.turn} step ${String(r.step).padStart(3)} ctx=${String(r.total).padStart(6)} ${String(pct).padStart(3)}%`);
}
