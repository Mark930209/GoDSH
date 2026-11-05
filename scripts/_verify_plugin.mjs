import fs from 'node:fs';
const f = process.env.TEMP + '\\n1n-diag.jsonl';
const raw = fs.readFileSync(f, 'utf8');
const lines = raw.split('\n').filter(Boolean);
const evs = [];
let bad = 0;
for (const l of lines) { try { evs.push(JSON.parse(l)); } catch { bad += 1; } }
console.log('lines:', lines.length, '| unparsable:', bad);
const t = (e) => Date.parse(e.t);

const hooks = {};
for (const e of evs) hooks[e.hook] = (hooks[e.hook] ?? 0) + 1;
console.log('\n=== hook counts (whole file) ===');
for (const [k, v] of Object.entries(hooks).sort((a, b) => b[1] - a[1])) console.log('  ', v, k);

// Where does the current process begin? The last `apply` starts a new run.
const applies = evs.filter((e) => e.hook === 'apply');
const boot = applies.length > 0 ? applies.at(-1) : evs[0];
console.log('\n=== boot marker ===');
console.log(' ', boot.t, 'total apply events:', applies.length);

const since = t(boot);
const after = evs.filter((e) => t(e) >= since);
console.log('events since boot:', after.length);

// Pair each rewrite with a later stream line.
let paired = 0;
const orphans = [];
for (let i = 0; i < after.length; i += 1) {
  if (after[i].hook !== 'llm:rewrite') continue;
  let found = false;
  for (let j = i + 1; j < after.length && t(after[j]) - t(after[i]) < 3000; j += 1) {
    if (after[j].hook === 'stream') { found = true; break; }
  }
  if (found) paired += 1; else orphans.push(after[i]);
}
console.log('\n=== rewrite -> stream pairing since boot ===');
console.log('  paired:', paired, '| orphaned:', orphans.length);
for (const o of orphans) console.log('   ORPHAN', o.t, 'tools=' + o.tools, 'model=' + (o.model ?? '-'));

// Streams on the text protocol vs routes that fell back to native.
const streams = after.filter((e) => e.hook === 'stream');
const native = streams.filter((s) => s.downgraded === true);
const text = streams.filter((s) => s.downgraded === false && s.allowed === true);
console.log('\n=== stream routes since boot ===', streams.length);
console.log('  text-protocol (downgraded=false):', text.length);
console.log('  native fallback (downgraded=true):', native.length);
const byModel = {};
for (const s of streams) {
  const k = `${s.provider}/${s.model} ${s.downgraded ? 'NATIVE' : 'TEXT'} tools=${s.tools}`;
  byModel[k] = (byModel[k] ?? 0) + 1;
}
for (const [k, v] of Object.entries(byModel)) console.log('   ', v, k);

// Any unpatch / patch failure?
const patch = after.filter((e) => String(e.hook).startsWith('llm:patch') || String(e.hook).startsWith('llm:unpatch'));
console.log('\n=== patch events ===');
for (const e of patch) console.log('  ', e.t, e.hook, JSON.stringify(e));

// The last few events, verbatim.
console.log('\n=== last 6 events ===');
for (const e of evs.slice(-6)) console.log(JSON.stringify(e));
