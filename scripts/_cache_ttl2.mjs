// How long does the gateway keep a prompt cache entry alive, and does the
// OpenAI-compatible `prompt_cache_retention: "24h"` field extend it?
//
// Writes a warm prefix, waits, then re-sends the identical body. A hit after the
// wait proves the entry survived; the elapsed time is the observed TTL floor.
import fs from 'node:fs';
import path from 'node:path';

const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const MODEL = 'deepseek-v4.1-flash';
const WAIT_MS = Number(process.env.WAIT_MS || 360000);

const system = Array.from({ length: 120 }, (_, i) =>
  `Rule ${String(i).padStart(3, '0')}: keep identifiers byte-exact and quote paths verbatim. Anchor ${i}.`
).join('\n');

async function send(nonce, retention) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: `${nonce}\n\n${system}` },
      { role: 'user', content: 'Reply with exactly: ok' }
    ],
    max_tokens: 8,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true },
    prompt_cache_key: nonce
  };
  if (retention) body.prompt_cache_retention = retention;
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) return { ok: false, status: res.status, error: (await res.text()).slice(0, 200) };
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
  return { ok: true, input, cached };
}

const show = (label, r) => {
  if (!r.ok) return console.log(`${label}: HTTP ${r.status} ${r.error}`);
  const pct = r.input ? Math.round((r.cached / r.input) * 100) : -1;
  console.log(`${label}: input=${r.input} cached=${r.cached} -> ${pct}%`);
  return pct;
};

console.log('--- does the gateway accept prompt_cache_retention at all? ---');
const bad = await send(`probe-${Date.now()}`, '24h');
show('with prompt_cache_retention=24h', bad);

console.log('\n--- arm A: no retention field ---');
const a = `ttl-a-${Date.now().toString(36)}`;
show('warm ', await send(a, null));
console.log(`\nwaiting ${Math.round(WAIT_MS / 60000)} min ...`);
await new Promise((r) => setTimeout(r, WAIT_MS));
show('reuse', await send(a, null));

console.log('\n--- arm B: prompt_cache_retention=24h ---');
const bkey = `ttl-b-${Date.now().toString(36)}`;
show('warm ', await send(bkey, '24h'));
console.log(`\nwaiting ${Math.round(WAIT_MS / 60000)} min ...`);
await new Promise((r) => setTimeout(r, WAIT_MS));
show('reuse', await send(bkey, '24h'));

console.log('\ndone');
