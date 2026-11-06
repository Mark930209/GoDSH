// The real traffic pattern is append-only: every request is the previous one
// plus a few more messages. Identical-body replay (the first probe) does not
// exercise that, so this one grows the conversation turn by turn and compares
// arms under the same growth.
import fs from 'node:fs';
import path from 'node:path';

const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const MODEL = process.argv[2] || 'deepseek-v4.1-flash';
const STEPS = Number(process.argv[3] || 10);
const ARM = process.argv[4] || 'baseline';

const nonce = `sess-${Date.now().toString(36)}`;

// A bulky stable system prompt, like a tool catalog.
const system = Array.from({ length: 150 }, (_, i) =>
  `Rule ${String(i).padStart(3, '0')}: keep identifiers byte-exact; never reorder sections; quote paths verbatim. Reference ${nonce}-${i}.`
).join('\n');

// Each step appends a user/tool exchange, exactly like an agent turn.
function messagesFor(step) {
  const messages = [{ role: 'system', content: system }];
  for (let i = 0; i < step; i += 1) {
    messages.push({ role: 'user', content: `Step ${i}: please inspect item ${i} and report its size.` });
    messages.push({ role: 'assistant', content: `Item ${i} is ${(i * 37) % 997} bytes.` });
  }
  messages.push({ role: 'user', content: `Now answer with exactly: ok` });
  return messages;
}

const FRESH = process.argv[5] === 'fresh';

function headersFor() {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };
  if (ARM === 'affinity' || ARM === 'cachekey') {
    headers['x-session-affinity'] = nonce;
    headers['x-client-request-id'] = nonce;
    headers['session_id'] = nonce;
  }
  if (FRESH) headers.Connection = 'close';
  return headers;
}

function bodyFor(step) {
  const body = {
    model: MODEL,
    messages: messagesFor(step),
    max_tokens: 8,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true }
  };
  if (ARM === 'cachekey' || ARM === 'affinity') body.prompt_cache_key = nonce;
  return body;
}

async function once(step) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headersFor(),
    body: JSON.stringify(bodyFor(step))
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

console.log(`arm=${ARM} model=${MODEL} nonce=${nonce}`);
const rates = [];
for (let step = 0; step < STEPS; step += 1) {
  const r = await once(step);
  if (!r.ok) { console.log(`  step ${step} FAILED`, r.status, r.error); break; }
  const pct = r.input > 0 ? Math.round((r.cached / r.input) * 100) : -1;
  rates.push(pct);
  console.log(`  step ${String(step).padStart(2)} input=${String(r.input).padStart(6)} cached=${String(r.cached).padStart(6)} -> ${String(pct).padStart(3)}%`);
}
const measured = rates.slice(1);
if (measured.length) {
  const avg = Math.round(measured.reduce((a, c) => a + c, 0) / measured.length);
  const hits = measured.filter((r) => r >= 50).length;
  console.log(`  => hits ${hits}/${measured.length}, avg ${avg}%, min ${Math.min(...measured)}%`);
}
