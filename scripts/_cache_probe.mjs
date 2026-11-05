// Controlled prompt-cache A/B probe against an OpenAI-compatible gateway.
// Usage: node _cache_probe.mjs <mode> [steps] [fillerSentences]
//   mode: native   -> tool catalog in the `tools` field
//         prompt   -> tool catalog rendered into the system message, no `tools`
//         none     -> no tools at all (control)
import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2] || 'native';
const STEPS = Number(process.argv[3] || 6);
const FILLER = Number(process.argv[4] || 40);
const GROWTH = Number(process.argv[5] || FILLER / 2);

const BASE = 'https://llm-api.net/v1';
const MODEL = 'deepseek-v4.1-flash';

// --- key from dsh credentials file ---
const credPath = path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml');
const cred = fs.readFileSync(credPath, 'utf8');
const m = cred.match(/N1N_API_KEY:\s*(\S+)/);
if (!m) throw new Error('N1N_API_KEY not found');
const KEY = m[1];

// --- real tool catalog captured from a live session request header ---
const tools = JSON.parse(fs.readFileSync(new URL('./.scratch/tools_real.json', import.meta.url.replace(/scripts\/[^/]*$/, '')) , 'utf8'));
// fallback path handling
function loadTools() {
  for (const p of ['.scratch/tools_real.json', 'scripts/.scratch/tools_real.json', 'E:/Projects/DSH_Plugins_Dev/.scratch/tools_real.json']) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  throw new Error('tools_real.json not found');
}
const TOOLS = loadTools();

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function renderToolCatalog(list) {
  const byName = [...list].filter((t) => !t.deferLoading).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const lines = [];
  lines.push('# Tools');
  lines.push('');
  lines.push('You can call tools. To call one, emit a line of exactly this form:');
  lines.push('');
  lines.push('@@TOOL@@ {"name":"<tool-name>","arguments":{...}}');
  lines.push('');
  lines.push('Rules:');
  lines.push('- "arguments" must be a JSON object matching the tool schema.');
  lines.push('- One tool call per @@TOOL@@ line; you may emit several lines for multiple calls.');
  lines.push('- Do not wrap the @@TOOL@@ line in prose or code fences; it must start at the beginning of a line.');
  lines.push('- After emitting tool calls, stop; tool results are returned in the next message.');
  lines.push('');
  lines.push('Available tools (sorted by name; parameters are JSON Schema):');
  lines.push('');
  for (const t of byName) {
    lines.push(`## ${t.name}`);
    if (t.description) lines.push(t.description);
    lines.push('Parameters: ' + stable(t.parameters ?? {}));
    lines.push('');
  }
  return lines.join('\n');
}

const FILLER_SENTENCE = 'The quick brown fox jumps over the lazy dog while the system records deterministic measurements for later comparison. ';
function filler(n) {
  return FILLER_SENTENCE.repeat(n);
}

const NATIVE_TOOLS = TOOLS.filter((t) => !t.deferLoading).map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

const baseSystem = 'You are a precise assistant. Answer with a single word when asked a trivial question.';

async function call(messages, systemText) {
  const body = {
    model: MODEL,
    messages: [{ role: 'system', content: systemText }, ...messages],
    max_tokens: 8,
    temperature: 0,
    stream: false,
  };
  if (mode === 'native') body.tools = NATIVE_TOOLS;
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

function usageOf(json) {
  const u = json.usage || {};
  const details = u.prompt_tokens_details || {};
  const cached = details.cached_tokens ?? u.prompt_cache_hit_tokens ?? u.cache_read_input_tokens ?? 0;
  const prompt = u.prompt_tokens ?? 0;
  return { prompt, cached, completion: u.completion_tokens, total: u.total_tokens, raw: u };
}

const systemText = mode === 'prompt' ? baseSystem + '\n\n' + renderToolCatalog(TOOLS) : baseSystem;

// Fixed seed user message, then append fabricated turns each step.
const messages = [{ role: 'user', content: 'Context seed:\n' + filler(FILLER) }];

console.log(`mode=${mode} steps=${STEPS} tools=${TOOLS.length} nativeToolChars=${JSON.stringify(NATIVE_TOOLS).length} systemChars=${systemText.length}`);
console.log('step  prompt  cached  hit%   completion');
const rows = [];
for (let step = 1; step <= STEPS; step++) {
  const json = await call(messages, systemText);
  const u = usageOf(json);
  const hit = u.prompt ? (u.cached / u.prompt) * 100 : 0;
  rows.push({ step, ...u, hit });
  console.log(
    String(step).padStart(4),
    String(u.prompt).padStart(7),
    String(u.cached).padStart(7),
    hit.toFixed(1).padStart(6),
    String(u.completion).padStart(8),
  );
  // grow the conversation deterministically
  messages.push({ role: 'assistant', content: filler(2) });
  messages.push({ role: 'user', content: `Step ${step} follow-up: ` + filler(GROWTH) });
}
const tP = rows.reduce((a, r) => a + r.prompt, 0);
const tC = rows.reduce((a, r) => a + r.cached, 0);
console.log(`AGG hit% ${(tC / tP * 100).toFixed(1)}  sumPrompt ${tP}  sumCached ${tC}`);
console.log('first raw usage:', JSON.stringify(rows[0].raw));
