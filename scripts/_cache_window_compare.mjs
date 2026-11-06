// Is the native mode genuinely colder, or is that an artefact of the broken
// window (09:25-10:10) that happens to sit inside the native run?
// Restrict to the post-restart window where the plugin was healthy, and report
// both modes on comparable ground.
import fs from 'node:fs';
import zlib from 'node:zlib';

const sessionPath = process.argv[2];
const sid = process.argv[3];
const from = process.argv[4] || '2026-11-05T13:26:00Z';

const diag = [];
for (const line of fs.readFileSync(process.env.TEMP + '\\n1n-diag.jsonl', 'utf8').split('\n')) {
  if (!line) continue;
  try { diag.push(JSON.parse(line)); } catch { /* skip */ }
}

const b = fs.readFileSync(sessionPath);
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const starts = [];
for (let i = 0; i <= b.length - 4; i += 1) if (b.compare(magic, 0, 4, i, i + 4) === 0) starts.push(i);
let text = '';
for (let k = 0; k < starts.length; k += 1) {
  const end = k + 1 < starts.length ? starts[k + 1] : b.length;
  try { text += zlib.zstdDecompressSync(b.subarray(starts[k], end)).toString('utf8'); } catch { /* partial */ }
}
const evs = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const messages = evs
  .filter((e) => e.type === 'assistant/message' && e.time !== undefined)
  .map((e) => {
    const u = e.data.usage ?? {};
    const cache = u.cacheReadTokens ?? 0;
    const input = u.inputTokens ?? 0;
    return { turn: e.data.turn, step: e.data.step, time: e.time, input, cache, total: input + cache };
  })
  .filter((m) => m.time >= Date.parse(from))
  .sort((a, b2) => a.time - b2.time);

const streams = diag
  .filter((e) => e.hook === 'stream' && (!sid || e.sessionId === sid))
  .map((e) => ({ t: Date.parse(e.t), downgraded: e.downgraded === true }))
  .sort((a, b2) => a.t - b2.t);

function stateAt(time) {
  let lo = 0; let hi = streams.length - 1; let best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (streams[mid].t <= time) { best = streams[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

const rate = (r) => (r.total > 0 ? r.cache / r.total : 0);
const hit = (r) => rate(r) >= 0.5;

console.log(`window: >= ${from}  (post-restart, plugin healthy)`);
console.log('requests:', messages.length);

const groups = new Map();
for (const m of messages) {
  const s = stateAt(m.time);
  const key = s === null ? 'unknown' : s.downgraded ? 'native tools' : 'text protocol';
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(m);
}
for (const [key, list] of groups) {
  const hits = list.filter(hit).length;
  const avg = Math.round((list.reduce((a, c) => a + rate(c), 0) / list.length) * 100);
  console.log(`  ${key.padEnd(14)} n=${String(list.length).padStart(3)} hit=${String(Math.round((hits / list.length) * 100)).padStart(3)}% avg=${String(avg).padStart(3)}%`);
}

// Skip each request that immediately follows a switch, so only steady state is
// compared.
const switchTimes = [];
for (let i = 1; i < streams.length; i += 1) {
  if (streams[i].downgraded !== streams[i - 1].downgraded) switchTimes.push(streams[i].t);
}
const isFirstAfterSwitch = (m) => {
  const prior = messages.filter((x) => x.time < m.time).at(-1);
  return prior === undefined || switchTimes.some((t) => t > (prior?.time ?? 0) && t <= m.time);
};

console.log('\nsteady state only (first request after a switch removed):');
const steady = messages.filter((m) => !isFirstAfterSwitch(m));
const g2 = new Map();
for (const m of steady) {
  const s = stateAt(m.time);
  const key = s === null ? 'unknown' : s.downgraded ? 'native tools' : 'text protocol';
  if (!g2.has(key)) g2.set(key, []);
  g2.get(key).push(m);
}
for (const [key, list] of g2) {
  if (!list.length) continue;
  const hits = list.filter(hit).length;
  const avg = Math.round((list.reduce((a, c) => a + rate(c), 0) / list.length) * 100);
  console.log(`  ${key.padEnd(14)} n=${String(list.length).padStart(3)} hit=${String(Math.round((hits / list.length) * 100)).padStart(3)}% avg=${String(avg).padStart(3)}%`);
}
