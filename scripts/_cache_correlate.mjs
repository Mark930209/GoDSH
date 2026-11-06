import fs from 'node:fs';
import zlib from 'node:zlib';

const sessionPath = process.argv[2];
const diagPath = process.env.TEMP + '\\n1n-diag.jsonl';

// ---- read the diag rewrite events (prefix fingerprints) ----
const diag = [];
for (const line of fs.readFileSync(diagPath, 'utf8').split('\n')) {
  if (!line) continue;
  try { const e = JSON.parse(line); if (e.hook === 'llm:rewrite') diag.push(e); } catch { /* skip */ }
}

// ---- read the session log ----
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
  .filter((e) => e.type === 'assistant/message')
  .map((e) => {
    const d = e.data;
    const u = d.usage ?? {};
    const cache = u.cacheReadTokens ?? 0;
    const input = u.inputTokens ?? 0;
    return {
      turn: d.turn,
      step: d.step,
      time: e.time,
      input,
      cache,
      rate: input + cache > 0 ? cache / (input + cache) : 0
    };
  })
  .filter((m) => m.time !== undefined)
  .sort((a, b2) => a.time - b2.time);

// ---- attach the nearest preceding rewrite fingerprint to each request ----
const diagSorted = diag.map((e) => ({ t: Date.parse(e.t), prefixHash: e.prefixHash, catHash: e.catHash, catLen: e.catLen, tools: e.tools })).sort((a, b2) => a.t - b2.t);
function fingerprintAt(time) {
  let lo = 0;
  let hi = diagSorted.length - 1;
  let best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (diagSorted[mid].t <= time) { best = diagSorted[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

let prevPrefix = null;
let prevCat = null;
const rows = [];
for (const m of messages) {
  const fp = fingerprintAt(m.time);
  const prefixChanged = fp && prevPrefix !== null && fp.prefixHash !== prevPrefix;
  const catChanged = fp && prevCat !== null && fp.catHash !== prevCat;
  rows.push({ ...m, fp, prefixChanged: Boolean(prefixChanged), catChanged: Boolean(catChanged) });
  if (fp) { prevPrefix = fp.prefixHash; prevCat = fp.catHash; }
}

// ---- summarise: miss rate conditioned on whether the fingerprint moved ----
const miss = (r) => r.rate < 0.05;
const bucket = (label, subset) => {
  if (subset.length === 0) { console.log(`  ${label}: n=0`); return; }
  const misses = subset.filter(miss).length;
  console.log(`  ${label}: n=${subset.length} miss=${misses} (${Math.round((misses / subset.length) * 100)}%)`);
};

console.log('=== overall ===');
bucket('all', rows);
console.log('\n=== conditioned on prefix fingerprint change since previous request ===');
bucket('prefix changed', rows.filter((r) => r.prefixChanged));
bucket('prefix stable ', rows.filter((r) => !r.prefixChanged));
console.log('\n=== conditioned on catalog hash change ===');
bucket('catalog changed', rows.filter((r) => r.catChanged));
bucket('catalog stable ', rows.filter((r) => !r.catChanged));

// ---- longest miss run, and whether the prefix was stable through it ----
let run = [];
const runs = [];
for (const r of rows) {
  if (miss(r)) run.push(r); else { if (run.length) runs.push(run); run = []; }
}
if (run.length) runs.push(run);
runs.sort((a, b2) => b2.length - a.length);
console.log('\n=== longest miss runs (are they explained by prefix churn?) ===');
for (const rr of runs.slice(0, 6)) {
  const changed = rr.filter((r) => r.prefixChanged).length;
  const cats = new Set(rr.map((r) => r.fp?.catHash));
  const prefixes = new Set(rr.map((r) => r.fp?.prefixHash));
  console.log(
    `  len=${rr.length} turn ${rr[0].turn} step ${rr[0].step}-${rr.at(-1).step}`,
    `| prefix changes=${changed}`,
    `| distinct prefixes=${prefixes.size}`,
    `| distinct catalogs=${cats.size}`
  );
}

// ---- print the sharpest window: the transition into and out of the worst run ----
const worst = runs[0];
if (worst) {
  const first = worst[0];
  const idx = rows.indexOf(first);
  console.log('\n=== 4 requests before / after the worst run ===');
  for (const r of rows.slice(Math.max(0, idx - 4), idx + worst.length + 4)) {
    console.log(
      '  turn', r.turn, 'step', r.step,
      'rate=' + Math.round(r.rate * 100) + '%',
      'prefix=' + (r.fp?.prefixHash ?? '-'),
      'catalog=' + (r.fp?.catHash ?? '-'),
      'tools=' + (r.fp?.tools ?? '-'),
      r.prefixChanged ? '<<PREFIX MOVED' : ''
    );
  }
}
