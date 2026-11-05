// Is the gateway's cache miss random (multi-backend) or prefix-driven?
// Prints conditional probabilities of a miss given the previous outcome,
// plus miss rate by time-gap bucket.
// Usage: node scripts/_cache_conditional.mjs <session.v4.jsonl.zstd>
import fs from 'node:fs';
import zlib from 'node:zlib';

function readSession(file) {
  const buf = fs.readFileSync(file);
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const starts = [];
  for (let i = 0; i <= buf.length - 4; i += 1) if (buf.compare(magic, 0, 4, i, i + 4) === 0) starts.push(i);
  const out = [];
  for (let k = 0; k < starts.length; k += 1) {
    const end = k + 1 < starts.length ? starts[k + 1] : buf.length;
    try {
      const text = zlib.zstdDecompressSync(buf.subarray(starts[k], end)).toString('utf8');
      for (const line of text.split('\n')) if (line.trim()) out.push(JSON.parse(line));
    } catch {
      /* torn frame */
    }
  }
  return out;
}

const rows = [];
for (const file of process.argv.slice(2)) {
  const events = readSession(file);
  let route = '?';
  let tools = -1;
  for (const event of events) {
    if (event.type === 'request/header') {
      const cfg = event.data?.header?.config ?? {};
      route = `${cfg.provider}/${cfg.model}`;
      tools = (event.data?.header?.tools ?? []).length;
      continue;
    }
    if (event.type !== 'assistant/message' || !event.data?.usage) continue;
    const u = event.data.usage;
    const prompt = Number(u.inputTokens ?? 0) + Number(u.cacheReadTokens ?? 0);
    if (prompt <= 0) continue;
    rows.push({
      t: event.time,
      route,
      tools,
      prompt,
      rate: Number(u.cacheReadTokens ?? 0) / prompt,
      turn: event.data.turn,
      step: event.data.step,
    });
  }
}

const misses = rows.filter((r) => r.rate < 0.05).length;
const hits = rows.filter((r) => r.rate > 0.8).length;
const mid = rows.length - misses - hits;
console.log(`n=${rows.length}  full-hit(>80%)=${hits}  partial=${mid}  miss(<5%)=${misses}`);
console.log(`P(miss)=${(100 * misses / rows.length).toFixed(1)}%`);

// Conditional on the previous request of the same (route, tools) run.
let afterHitMiss = 0, afterHitN = 0, afterMissMiss = 0, afterMissN = 0;
for (let i = 1; i < rows.length; i += 1) {
  const prev = rows[i - 1];
  const cur = rows[i];
  if (prev.route !== cur.route) continue;
  if (prev.rate > 0.8) { afterHitN += 1; if (cur.rate < 0.05) afterHitMiss += 1; }
  if (prev.rate < 0.05) { afterMissN += 1; if (cur.rate < 0.05) afterMissMiss += 1; }
}
console.log(`P(miss | prev hit )=${(100 * afterHitMiss / afterHitN).toFixed(1)}%  (n=${afterHitN})`);
console.log(`P(miss | prev miss)=${(100 * afterMissMiss / afterMissN).toFixed(1)}%  (n=${afterMissN})`);
console.log('→ if both are close to the unconditional P(miss), misses are independent of history (random routing).');

// Miss rate by gap since the previous request.
const buckets = [[0, 15], [15, 60], [60, 180], [180, 600], [600, 1e9]];
console.log('\ngap(s)         n   miss%');
for (const [lo, hi] of buckets) {
  const rowsIn = [];
  for (let i = 1; i < rows.length; i += 1) {
    const gap = (rows[i].t - rows[i - 1].t) / 1000;
    if (gap >= lo && gap < hi && rows[i].route === rows[i - 1].route) rowsIn.push(rows[i]);
  }
  if (rowsIn.length === 0) continue;
  const m = rowsIn.filter((r) => r.rate < 0.05).length;
  const label = hi > 1e8 ? `>=${lo}` : `${lo}-${hi}`;
  console.log(`${label.padEnd(12)} ${String(rowsIn.length).padStart(4)}  ${(100 * m / rowsIn.length).toFixed(1).padStart(6)}`);
}
