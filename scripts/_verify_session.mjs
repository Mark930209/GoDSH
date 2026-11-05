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
  try { text += zlib.zstdDecompressSync(b.subarray(starts[k], end)).toString('utf8'); } catch { /* partial tail frame */ }
}
const evs = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
console.log('frames:', starts.length, '| events:', evs.length);

const marker = /@@TOOL@@|<tool_call|<function\s*=|DSML/;

// Only the assistant messages produced since the restart (turn >= 4).
const mine = evs.filter((e) => e.type === 'assistant/message' && (e.data?.turn ?? 0) >= 4);
console.log('\n=== assistant messages turn>=4 ===');
let leaks = 0;
for (const e of mine) {
  const d = e.data;
  const content = d.message?.content ?? [];
  const kinds = content.map((c) => c.type);
  const shown = content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  const leak = marker.test(shown);
  if (leak) leaks += 1;
  const u = d.usage ?? {};
  const cache = u.cacheReadTokens ?? 0;
  const rate = u.inputTokens + cache > 0 ? Math.round((cache / (u.inputTokens + cache)) * 100) : 0;
  console.log(
    `  turn ${d.turn} step ${d.step} [${kinds.join(',')}]`,
    `calls=${kinds.filter((k) => k === 'tool-call').length}`,
    `textLen=${shown.length}`,
    `cache=${rate}%`,
    leak ? '<<< LEAK' : ''
  );
}
console.log('\nleaks:', leaks);

// Every tool call the harness actually recorded since the restart.
const calls = evs.filter((e) => e.type === 'tool/call').slice(-8);
console.log('\n=== last tool/call events ===');
for (const c of calls) console.log('  ', c.data?.name ?? JSON.stringify(c.data).slice(0, 80));
