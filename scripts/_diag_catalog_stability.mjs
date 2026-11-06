// Is the rendered tool catalog stable across a whole run? A changed catHash
// invalidates the *entire* system-prompt prefix, which is the most expensive
// possible miss, so it has to be provably constant.
import fs from 'node:fs';

const p = process.env.TEMP + '\\n1n-diag.jsonl';
const events = [];
for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
  if (!line) continue;
  try { events.push(JSON.parse(line)); } catch { /* skip */ }
}

const rewrites = events.filter((e) => e.hook === 'llm:rewrite');
console.log('total events:', events.length, '| llm:rewrite:', rewrites.length);

const byCatalog = new Map();
for (const e of rewrites) {
  const key = `${e.catHash}/${e.catLen}`;
  if (!byCatalog.has(key)) byCatalog.set(key, { first: e.t, last: e.t, n: 0, tools: new Set() });
  const rec = byCatalog.get(key);
  rec.last = e.t;
  rec.n += 1;
  rec.tools.add(e.tools);
}
console.log('\n=== distinct rendered catalogs over the whole diag ===');
for (const [key, rec] of [...byCatalog.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${key}  n=${rec.n}  tools=${[...rec.tools].sort((a, b) => a - b).join(',')}  ${rec.first} .. ${rec.last}`);
}

// Prefix fingerprint: how often does the message prefix actually move?
const prefixes = rewrites.filter((e) => e.prefixHash).map((e) => ({ t: e.t, h: e.prefixHash }));
let moves = 0;
const movesList = [];
for (let i = 1; i < prefixes.length; i += 1) {
  if (prefixes[i].h !== prefixes[i - 1].h) {
    moves += 1;
    movesList.push({ from: prefixes[i - 1], to: prefixes[i] });
  }
}
console.log(`\n=== prefix fingerprint moves: ${moves} of ${prefixes.length} consecutive pairs ===`);
for (const m of movesList.slice(-12)) {
  console.log(`  ${m.from.t.slice(11, 19)} ${m.from.h} -> ${m.to.t.slice(11, 19)} ${m.to.h}`);
}

// Within one process restart the catalog must be constant; report the longest
// constant run so a mid-run change stands out.
console.log('\n=== catalogue hash by hour (a change mid-session would show here) ===');
const byHour = new Map();
for (const e of rewrites) {
  const hour = e.t.slice(0, 13);
  if (!byHour.has(hour)) byHour.set(hour, new Map());
  const m = byHour.get(hour);
  const k = `${e.catHash}/${e.catLen}`;
  m.set(k, (m.get(k) ?? 0) + 1);
}
for (const [hour, m] of [...byHour.entries()].sort()) {
  console.log(`  ${hour}Z  ` + [...m.entries()].map(([k, n]) => `${k} x${n}`).join('  '));
}
