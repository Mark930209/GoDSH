// Print the per-step usage of a session (turn, step, prompt, cached, rate), so
// the cache behaviour can be read directly instead of inferred.
import fs from 'node:fs';
import zlib from 'node:zlib';

const sessionPath = process.argv[2];
const since = process.argv[3] ? Date.parse(process.argv[3]) : 0;

const b = fs.readFileSync(sessionPath);
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const starts = [];
for (let i = 0; i <= b.length - 4; i += 1) if (b.compare(magic, 0, 4, i, i + 4) === 0) starts.push(i);
let text = '';
for (let k = 0; k < starts.length; k += 1) {
  const end = k + 1 < starts.length ? starts[k + 1] : b.length;
  try {
    text += zlib.zstdDecompressSync(b.subarray(starts[k], end)).toString('utf8');
  } catch {
    /* torn frame */
  }
}
const evs = text
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const rows = evs
  .filter((e) => e.type === 'assistant/message' && e.time !== undefined)
  .map((e) => {
    const u = e.data.usage ?? {};
    const cache = u.cacheReadTokens ?? 0;
    const input = u.inputTokens ?? 0;
    return { turn: e.data.turn, step: e.data.step, time: e.time, input, cache, total: input + cache };
  })
  .filter((r) => r.time >= since)
  .sort((a, b2) => a.time - b2.time);

console.log('turn step  time      prompt    cached   rate');
let sumIn = 0;
let sumCa = 0;
for (const r of rows) {
  const pct = r.total ? Math.round((r.cache / r.total) * 100) : 0;
  console.log(
    `${String(r.turn).padStart(4)} ${String(r.step).padStart(4)}  ${new Date(r.time).toISOString().slice(11, 19)}  ` +
      `${String(r.total).padStart(8)} ${String(r.cache).padStart(9)} ${String(pct).padStart(5)}%`
  );
  sumIn += r.input;
  sumCa += r.cache;
}
const all = sumIn + sumCa;
console.log(`\nsteps=${rows.length}  billed=${sumIn.toLocaleString()}  cacheRead=${sumCa.toLocaleString()}  overall=${all ? Math.round((sumCa / all) * 100) : 0}%`);
