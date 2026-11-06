// Separate the two possible costs of a downgrade:
//   (a) the switch itself breaks the prefix, so the next request misses once;
//   (b) the native mode then runs persistently colder.
// Those have very different fixes, so they must not be lumped together.
import fs from 'node:fs';
import zlib from 'node:zlib';

const sessionPath = process.argv[2];
const sid = process.argv[3];
const diagPath = process.env.TEMP + '\\n1n-diag.jsonl';

const diag = [];
for (const line of fs.readFileSync(diagPath, 'utf8').split('\n')) {
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

const switchTimes = [];
for (let i = 1; i < streams.length; i += 1) {
  if (streams[i].downgraded !== streams[i - 1].downgraded) switchTimes.push(streams[i].t);
}

// Position = index (1-based) of this request among the requests at/after the
// most recent switch. 1 means "the first request the switch affects".
const rows = messages.map((m) => {
  const s = stateAt(m.time);
  const earlier = switchTimes.filter((t) => t <= m.time);
  const lastSwitch = earlier.length ? earlier.at(-1) : null;
  let position = null;
  if (lastSwitch !== null) {
    let n = 0;
    for (const other of messages) if (other.time >= lastSwitch && other.time <= m.time) n += 1;
    position = n;
  }
  return { ...m, downgraded: s ? s.downgraded : null, position };
});

const rate = (r) => (r.total > 0 ? r.cache / r.total : 0);
const hit = (r) => rate(r) >= 0.5;

console.log('=== hit rate by position within the current mode ===');
const byPos = new Map();
for (const r of rows) {
  const key = r.position ?? 0; // 0 = before any switch
  if (!byPos.has(key)) byPos.set(key, []);
  byPos.get(key).push(r);
}
for (const [pos, list] of [...byPos.entries()].sort((a, b2) => a[0] - b2[0])) {
  const label = pos === 0 ? 'before any switch' : `#${pos} after a switch`;
  const hits = list.filter(hit).length;
  console.log(`  ${label.padEnd(22)} n=${String(list.length).padStart(3)} hit=${String(Math.round((hits / list.length) * 100)).padStart(3)}%`);
}

console.log('\n=== first 3 requests after each switch ===');
for (const t of switchTimes) {
  const label = stateAt(t)?.downgraded ? 'native' : 'text';
  console.log(`  switch @${new Date(t).toISOString().slice(11, 19)} -> ${label}`);
  const affected = messages.filter((m) => m.time >= t).slice(0, 3);
  for (const [i, m] of affected.entries()) {
    console.log(
      `    #${i + 1} turn ${m.turn} step ${String(m.step).padStart(3)} ` +
        `input=${String(m.input).padStart(6)} cached=${String(m.cache).padStart(6)} ${Math.round(rate(m) * 100)}%`
    );
  }
}

console.log('\n=== steady state: drop the first request after each switch ===');
const steady = rows.filter((r) => r.position !== 1);
const show = (label, list) => {
  if (!list.length) return console.log(`  ${label}: n=0`);
  const hits = list.filter(hit).length;
  console.log(`  ${label}: n=${String(list.length).padStart(3)} hit=${String(Math.round((hits / list.length) * 100)).padStart(3)}%`);
};
show('text protocol', steady.filter((r) => r.downgraded === false));
show('native tools ', steady.filter((r) => r.downgraded === true));
