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
  try { text += zlib.zstdDecompressSync(b.subarray(starts[k], end)).toString('utf8'); } catch { /* partial tail */ }
}
const evs = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// The DSH process restarted at 13:25:36Z (21:25:36 local).
const BOOT = Date.parse('2026-11-05T13:25:00Z');
const at = (e) => (typeof e.time === 'number' ? e.time : Date.parse(e.time ?? e.t));

console.log('turn starts:');
for (const e of evs.filter((x) => x.type === 'turn/start')) {
  const t = at(e);
  console.log('  turn', e.data.turn, new Date(t).toISOString().slice(11, 19), t >= BOOT ? '(after restart)' : '(before restart)');
}

const after = evs.filter((e) => e.type === 'assistant/message' && at(e) >= BOOT);
console.log('\nassistant messages after restart:', after.length);

// A real leak is tool-call syntax in visible text that produced no tool-call block.
// A message that DOES carry a parsed call and merely mentions the marker in prose
// is the agent talking about the protocol, not a parser failure.
const CALL_SYNTAX = /<\|DSML\||<｜DSML｜|<tool_call>|<function\s*=|@@TOOL@@\s*\{/;
let realLeaks = 0;
let proseMentions = 0;
for (const e of after) {
  const d = e.data;
  const content = d.message?.content ?? [];
  const shown = content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  const calls = content.filter((c) => c.type === 'tool-call').length;
  if (!CALL_SYNTAX.test(shown)) continue;
  if (calls > 0) { proseMentions += 1; continue; }
  realLeaks += 1;
  console.log('  REAL LEAK turn', d.turn, 'step', d.step, JSON.stringify(shown.slice(0, 160)));
}
console.log('\nreal leaks (syntax in text, no call parsed):', realLeaks);
console.log('messages that parsed a call and mention the marker in prose:', proseMentions);

// Did any turn after the restart end without a single tool call?
const steps = after.map((e) => e.data);
const withCalls = steps.filter((d) => (d.message?.content ?? []).some((c) => c.type === 'tool-call')).length;
console.log('\nsteps after restart:', steps.length, '| with a parsed tool call:', withCalls);

// Cache hit rate per step, post restart.
const rates = [];
for (const d of steps) {
  const u = d.usage ?? {};
  const cache = u.cacheReadTokens ?? 0;
  if (u.inputTokens === undefined && cache === 0) continue;
  const denom = (u.inputTokens ?? 0) + cache;
  if (denom <= 0) continue;
  rates.push(Math.round((cache / denom) * 100));
}
if (rates.length > 0) {
  const avg = Math.round(rates.reduce((a, c) => a + c, 0) / rates.length);
  const hits = rates.filter((r) => r >= 50).length;
  console.log(`\ncache: n=${rates.length} avg=${avg}% | >=50%: ${hits} | <5%: ${rates.filter((r) => r < 5).length}`);
}
