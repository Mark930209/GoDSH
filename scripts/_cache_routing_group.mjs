// The gateway returns `x-routing-group`, which names the backend it routed to.
// If misses line up with the routing group changing, the cache is per-backend
// and pinning the group is the lever.
import fs from 'node:fs';
import path from 'node:path';

const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const N = Number(process.argv[2] || 16);
const nonce = `route-${Date.now().toString(36)}`;

const system = Array.from({ length: 120 }, (_, i) =>
  `Rule ${String(i).padStart(3, '0')}: keep identifiers byte-exact and quote paths verbatim. ${nonce}-${i}.`
).join('\n');

const messages = [
  { role: 'system', content: system },
  { role: 'user', content: 'Reply with exactly: ok' }
];

async function send() {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
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
  const reqId = res.headers.get('x-api-request-id') ?? '';
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
  return { group, reqId: reqId.slice(-8), input, cached, rate: input ? cached / input : 0 };
}

const rows = [];
for (let i = 0; i < N; i += 1) {
  rows.push(await send());
}

console.log('idx | routing group      | reqId    | input | cached | rate');
for (const [i, r] of rows.entries()) {
  console.log(
    `${String(i).padStart(3)} | ${r.group.padEnd(19)}| ${r.reqId.padEnd(9)}| ${String(r.input).padStart(5)} | ${String(r.cached).padStart(6)} | ${Math.round(r.rate * 100)}%`
  );
}

const groups = new Map();
for (const r of rows) {
  if (!groups.has(r.group)) groups.set(r.group, []);
  groups.get(r.group).push(r);
}
console.log('\n=== per routing group ===');
for (const [g, list] of groups) {
  const hits = list.filter((r) => r.rate >= 0.5).length;
  console.log(`  ${g.padEnd(20)} n=${list.length} hits=${hits} (${Math.round((hits / list.length) * 100)}%)`);
}

// Does a hit follow a hit on the same group?
let same = 0;
let groupChanged = 0;
let hitsAfterChange = 0;
let hitsAfterSame = 0;
for (let i = 1; i < rows.length; i += 1) {
  const changed = rows[i].group !== rows[i - 1].group;
  const hit = rows[i].rate >= 0.5;
  if (changed) { groupChanged += 1; if (hit) hitsAfterChange += 1; }
  else { same += 1; if (hit) hitsAfterSame += 1; }
}
console.log('\n=== hit rate conditioned on the group changing ===');
console.log(`  same group    n=${same} hit=${hitsAfterSame} (${same ? Math.round((hitsAfterSame / same) * 100) : 0}%)`);
console.log(`  group changed n=${groupChanged} hit=${hitsAfterChange} (${groupChanged ? Math.round((hitsAfterChange / groupChanged) * 100) : 0}%)`);
