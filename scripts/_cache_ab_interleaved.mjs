// Baseline vs session-affinity, interleaved.
//
// Interleaving matters: backend/cache state drifts over time, so running all of
// arm A then all of arm B would confound the arm with wall-clock drift.
import fs from 'node:fs';
import path from 'node:path';

const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const ROUNDS = Number(process.argv[2] || 20);
const nonce = `ab-${Date.now().toString(36)}`;

const system = Array.from({ length: 150 }, (_, i) =>
  `Rule ${String(i).padStart(3, '0')}: keep identifiers byte-exact, quote paths verbatim, never reorder sections. ${nonce}-${i}.`
).join('\n');

const messages = [
  { role: 'system', content: system },
  { role: 'user', content: 'Reply with exactly: ok' }
];

async function send(arm) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };
  if (arm === 'affinity') {
    headers['x-session-affinity'] = nonce;
    headers['x-client-request-id'] = nonce;
    headers.session_id = nonce;
  }
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'deepseek-v4.1-flash',
      messages,
      max_tokens: 4,
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true }
    })
  });
  const group = res.headers.get('x-routing-group') ?? '(none)';
  if (!res.ok) return { ok: false, status: res.status, group };
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = null;
  for await (const part of res.body) {
    buffer += decoder.decode(part, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try { const j = JSON.parse(data); if (j.usage) usage = j.usage; } catch { /* ignore */ }
    }
  }
  const input = usage?.prompt_tokens ?? 0;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return { ok: true, group, input, cached, rate: input ? cached / input : 0 };
}

// Warm both arms once so the first round is not a cold write for either.
await send('baseline');
await send('affinity');

const arms = { baseline: [], affinity: [] };
for (let i = 0; i < ROUNDS; i += 1) {
  for (const arm of ['baseline', 'affinity']) {
    const r = await send(arm);
    if (r.ok) arms[arm].push(r);
  }
  if ((i + 1) % 5 === 0) process.stdout.write(`  ...${i + 1}/${ROUNDS} rounds\n`);
}

console.log('\n=== results ===');
for (const [arm, list] of Object.entries(arms)) {
  const hits = list.filter((r) => r.rate >= 0.5).length;
  const avg = list.length ? Math.round((list.reduce((a, c) => a + c.rate, 0) / list.length) * 100) : 0;
  console.log(`  ${arm.padEnd(9)} n=${list.length} hits=${hits} (${Math.round((hits / list.length) * 100)}%) avg=${avg}%`);
}

// Side by side, to show whether the misses are correlated across arms.
console.log('\n=== per round (B=baseline, A=affinity; . = hit, X = miss) ===');
const marks = arms.baseline.map((r, i) => {
  const b = r.rate >= 0.5 ? '.' : 'X';
  const a = arms.affinity[i] && arms.affinity[i].rate >= 0.5 ? '.' : 'X';
  return { i, b, a, same: b === a };
});
for (let i = 0; i < marks.length; i += 10) {
  const chunk = marks.slice(i, i + 10);
  console.log(`  ${String(i).padStart(3)}  B:${chunk.map((m) => m.b).join('')}   A:${chunk.map((m) => m.a).join('')}`);
}
const both = marks.filter((m) => m.same).length;
console.log(`\n  identical outcome in ${both}/${marks.length} rounds`);
console.log('  (high agreement => misses are a property of the moment, not of the headers)');
