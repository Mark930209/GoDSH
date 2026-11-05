// Reproduce the table from dsh-llm-text-tools' README against the live gateway.
//
// The claim under test: with a native `tools` field the provider's prefix cache
// stays pinned to a fixed head and the growing conversation is re-computed every
// step; with the same schemas rendered as text the cache grows with the
// conversation.
//
// Two arms, identical content, different placement:
//   native - schemas in the `tools` field
//   text   - schemas inlined in the system prompt, `tools` omitted
// Both arms replay the same synthetic conversation so the token totals stay
// comparable.
import fs from 'node:fs';
import path from 'node:path';

const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const MODEL = process.argv[2] || 'deepseek-v4.1-flash';
const STEPS = Number(process.argv[3] || 4);
// Real DSH catalogues are ~32K chars, i.e. roughly 8K tokens. The reference
// plugin's table shows native pinned at 4096 while text keeps growing, which
// looks like a size ceiling, so the catalogue has to be realistically large for
// the comparison to mean anything.
const PAD = Number(process.argv[4] || 1);
const FILLER_PER_TOOL = 12 * PAD;

// A catalogue of representative size: 32 tools, each with a JSON Schema.
// The `native` arm sends these in the wire format; `renderCatalog` reads the
// inner `.function` so both arms describe exactly the same tools.
const KINDS = ['read', 'write', 'search', 'list', 'patch', 'glob', 'grep', 'run'];
const TOOLS = Array.from({ length: 32 }, (_, i) => {
  const name = `tool_${String(i).padStart(2, '0')}_${KINDS[i % 8]}`;
  const long =
    `Tool number ${i}. Performs the ${KINDS[i % 8]} operation against the workspace. ` +
    'Arguments are validated against the schema before use, paths are resolved relative to the project root, ' +
    'and every invocation is recorded so it can be replayed. ' +
    'Note: this description is deliberately padded to reach the size of a real tool catalogue. '.repeat(FILLER_PER_TOOL);
  return {
    type: 'function',
    function: {
      name,
      description: long,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to the workspace root.' },
          pattern: { type: 'string', description: 'Glob or regular expression to match.' },
          recursive: { type: 'boolean', description: 'Whether to descend into subdirectories.' },
          limit: { type: 'number', description: 'Maximum number of results to return.' }
        },
        required: ['path'],
        additionalProperties: false
      }
    }
  };
});

/** Deterministic key ordering, so the two arms render byte-identical text. */
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}

/** The catalogue as the plugin renders it: name, description, parameters. */
function renderCatalog(tools) {
  const lines = ['Available tools (sorted by name; parameters are JSON Schema):'];
  const flat = tools.map((t) => t.function ?? t);
  for (const tool of [...flat].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    lines.push(`- ${tool.name}: ${tool.description}`);
    lines.push(`  Parameters: ${stable(tool.parameters)}`);
  }
  return lines.join('\n');
}

const PROTOCOL = [
  'To call a tool, emit exactly one line:',
  '@@TOOL@@ {"name": "<tool name>", "arguments": { ... }}',
  'Do not call a tool unless it is needed.'
].join('\n');

// A synthetic conversation that grows by a fixed amount each step, so any change
// in `cached` is attributable to the request shape and not to the content.
const FILLER = (i) =>
  `Step ${i}: the agent listed the directory, read two files, and confirmed the build still passes. ` +
  `Noting detail ${i} with enough words to make this turn meaningfully long. `.repeat(4);

async function send(arm, step) {
  const conversation = [];
  for (let i = 0; i < step; i += 1) {
    conversation.push({ role: 'user', content: FILLER(i) });
    conversation.push({ role: 'assistant', content: `Acknowledged step ${i}.` });
  }
  conversation.push({ role: 'user', content: 'Reply with exactly: ok' });

  const body = { model: MODEL, max_tokens: 4, temperature: 0, stream: true, stream_options: { include_usage: true } };

  if (arm === 'native') {
    body.messages = [{ role: 'system', content: 'You are a coding agent.' }, ...conversation];
    body.tools = TOOLS;
  } else {
    body.messages = [
      { role: 'system', content: `You are a coding agent.\n\n${PROTOCOL}\n\n${renderCatalog(TOOLS)}` },
      ...conversation
    ];
    // No `tools` field at all - this is the whole point of the plugin.
  }

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res.text();
    const retryable = res.status === 503 || res.status === 502 || res.status === 429;
    if (retryable) {
      // The gateway shed this request; back off and report it rather than
      // failing the whole comparison.
      await new Promise((r) => setTimeout(r, 3000));
      const again = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify(body)
      });
      if (again.ok) {
        return collect(again);
      }
      throw new Error(`${arm} step ${step}: HTTP ${res.status} then ${again.status}: ${detail.slice(0, 200)}`);
    }
    throw new Error(`${arm} step ${step}: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  return collect(res);
}

/** Drain one SSE response and return its usage. */
async function collect(res) {
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
  return { input, cached, prompt: input };
}

const results = { native: [], text: [] };
// Interleave the arms step by step so wall-clock drift cannot favour either.
for (let step = 0; step < STEPS; step += 1) {
  for (const arm of ['native', 'text']) {
    const r = await send(arm, step);
    results[arm].push(r);
    const pct = r.prompt ? Math.round((r.cached / r.prompt) * 100) : 0;
    console.log(`  step ${step} ${arm.padEnd(6)} prompt=${String(r.prompt).padStart(6)} cached=${String(r.cached).padStart(6)} (${String(pct).padStart(3)}%)`);
  }
}

console.log('\n=== pooled prompt growth (delta between step 0 and the last step) ===');
for (const arm of ['native', 'text']) {
  const list = results[arm];
  const first = list[0];
  const last = list.at(-1);
  const grew = last.prompt - first.prompt;
  const cacheGrew = last.cached - first.cached;
  console.log(
    `  ${arm.padEnd(6)} prompt +${String(grew).padStart(5)}  cached +${String(cacheGrew).padStart(5)}  ` +
      `-> cache tracked ${grew > 0 ? Math.round((cacheGrew / grew) * 100) : 0}% of the growth`
  );
}

console.log('\n=== does the cached prefix follow the conversation? ===');
for (const arm of ['native', 'text']) {
  const list = results[arm];
  const deltas = list.slice(1).map((r, i) => r.cached - list[i].cached);
  console.log(`  ${arm.padEnd(6)} cached steps: ${list.map((r) => r.cached).join(' -> ')}  (deltas ${deltas.join(', ')})`);
}
