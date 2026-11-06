// Controlled cache-affinity experiment against the n1n gateway.
//
// Question: does the gateway honour prompt-cache replay per backend, and can a
// session-affinity header or prompt_cache_key pin the requests to the backend
// that actually holds the cache? Two disjoint large prefixes are used so the
// two arms cannot warm each other.
import fs from 'node:fs';
import path from 'node:path';

const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const MODEL = process.argv[2] || 'deepseek-v4.1-flash';
const WARM = Number(process.argv[3] || 6);

// A deterministic, token-heavy prefix. Distinct per nonce so the two arms never
// share a cache entry.
function makePrefix(nonce) {
  const lines = [];
  for (let i = 0; i < 260; i += 1) {
    lines.push(
      `[${nonce}] rule ${String(i).padStart(3, '0')}: the assistant must keep every identifier byte-exact, ` +
        `quote file paths verbatim, and never reorder the sections of this reference document. ` +
        `Reference marker ${nonce}-${i}-${(i * 7919) % 100003}.`
    );
  }
  return `You are a careful assistant. Nonce ${nonce}.\n\n${lines.join('\n')}`;
}

function buildBody(nonce) {
  return {
    model: MODEL,
    messages: [
      { role: 'system', content: makePrefix(nonce) },
      { role: 'user', content: 'Reply with exactly: ok' }
    ],
    max_tokens: 8,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true }
  };
}

function headersFor(arm, nonce) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };
  if (arm === 'affinity') {
    headers['x-session-affinity'] = nonce;
    headers['x-client-request-id'] = nonce;
    headers['session_id'] = nonce;
  }
  return headers;
}

function bodyFor(arm, nonce) {
  const body = buildBody(nonce);
  if (arm === 'cachekey' || arm === 'affinity') body.prompt_cache_key = nonce;
  if (arm === 'longretention') {
    body.prompt_cache_key = nonce;
    body.prompt_cache_retention = '24h';
  }
  return body;
}

async function once(arm, nonce) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headersFor(arm, nonce),
    body: JSON.stringify(bodyFor(arm, nonce))
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, error: text.slice(0, 300) };
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = null;
  let servedBy = res.headers.get('x-served-by') || res.headers.get('x-backend') || res.headers.get('server') || '';
  let reqId = res.headers.get('x-request-id') || '';
  for await (const part of res.body) {
    buffer += decoder.decode(part, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        if (json.usage) usage = json.usage;
      } catch { /* ignore */ }
    }
  }
  const input = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
  const cached =
    usage?.prompt_tokens_details?.cached_tokens ??
    usage?.input_tokens_details?.cached_tokens ??
    usage?.cache_read_input_tokens ??
    0;
  return { ok: true, input, cached, usage, servedBy, reqId };
}

function rate(r) {
  const denom = r.input;
  return denom > 0 ? Math.round((r.cached / denom) * 100) : -1;
}

async function arm(name, noncePrefix) {
  const nonce = `${name}-${Date.now().toString(36)}-${noncePrefix}`;
  const rows = [];
  for (let i = 0; i < WARM; i += 1) {
    const r = await once(name === 'baseline' ? 'baseline' : name, nonce);
    rows.push(r);
    if (!r.ok) { console.log(`  ${name} #${i} FAILED`, r.status, r.error); break; }
  }
  return { name, nonce, rows };
}

const mode = process.argv[4] || 'all';

if (mode === 'usage') {
  // First: what does the gateway actually return in `usage`?
  const r = await once('baseline', `probe-${Date.now()}`);
  console.log('usage payload:', JSON.stringify(r.usage, null, 2));
  console.log('input:', r.input, 'cached:', r.cached, 'servedBy:', r.servedBy, 'reqId:', r.reqId);
} else {
  const arms = mode === 'all' ? ['baseline', 'cachekey', 'affinity', 'longretention'] : [mode];
  for (const name of arms) {
    const { rows } = await arm(name, 'x');
    console.log(`\n=== ${name} ===`);
    let hit = 0;
    const rates = [];
    for (const [i, r] of rows.entries()) {
      if (!r.ok) continue;
      const pct = rate(r);
      rates.push(pct);
      if (i === 0) console.log(`  #0 warm   input=${r.input} cached=${r.cached} -> cache WRITE`);
      else {
        console.log(`  #${i}       input=${r.input} cached=${r.cached} -> ${pct}%${pct >= 50 ? ' HIT' : ''}`);
        if (pct >= 50) hit += 1;
      }
    }
    const measured = rates.slice(1);
    const avg = measured.length ? Math.round(measured.reduce((a, c) => a + c, 0) / measured.length) : -1;
    console.log(`  => hits ${hit}/${measured.length}, avg ${avg}%`);
    await new Promise((r) => setTimeout(r, 1200));
  }
}
