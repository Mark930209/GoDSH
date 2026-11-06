// Decisive test: does the `tools` field block the *system prompt* from being
// cached, and does that show up only when the system prompt is large?
//
// The earlier probe used a tiny system prompt, where a broken cache would still
// cover most of the conversation. Real DSH prompts carry 23 sections, so the
// question is whether the penalty is size-dependent. This sweeps system-prompt
// size and holds everything else fixed.
//
// Arms:
//   native - schemas in the `tools` field, short system prompt
//   text   - schemas inlined in the system prompt, no `tools` field
// For each size, the two arms describe the same catalogue and the same
// conversation, so any difference in `cached` is attributable to placement.
import fs from 'node:fs';
import path from 'node:path';

const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const MODEL = process.argv[2] || 'deepseek-v4.1-flash';
const STEPS = Number(process.argv[3] || 4);
const SIZES = (process.argv[4] || '300,2000,6000').split(',').map(Number);

/** Deterministic key ordering so both arms render byte-identical text. */
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}

const KINDS = ['read', 'write', 'search', 'list', 'patch', 'glob', 'grep', 'run'];

/** A 32-tool catalogue, close to the real DSH one (~32K chars). */
const TOOLS = Array.from({ length: 32 }, (_, i) => ({
  type: 'function',
  function: {
    name: `tool_${String(i).padStart(2, '0')}_${KINDS[i % 8]}`,
    description:
      `Tool number ${i}. Performs the ${KINDS[i % 8]} operation against the workspace. ` +
      'Arguments are validated against the schema before use and paths resolve against the project root. ' +
      'Deliberately padded to reach the size of a real catalogue. '.repeat(10),
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
}));

function renderCatalog(tools) {
  const lines = ['Available tools (sorted by name; parameters are JSON Schema):'];
  const flat = tools.map((t) => t.function ?? t);
  for (const tool of [...flat].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    lines.push(`- ${tool.name}: ${tool.description}`);
    lines.push(`  Parameters: ${stable(tool.parameters)}`);
  }
  return lines.join('\n');
}

/** A system prompt of roughly `approxTokens` tokens, resembling DSH's sectioned one. */
function makeSystem(approxTokens) {
  const sections = [];
  let words = 0;
  const perSection = 60;
  while (words < approxTokens * 0.75) {
    const n = sections.length;
    sections.push(
      `## Section ${n}\n` +
        `You are operating inside a repository. Follow these rules exactly. ` +
        `Rule ${n}.1: prefer the smallest sufficient change. ` +
        `Rule ${n}.2: quote paths verbatim and keep identifiers byte-exact. ` +
        `Rule ${n}.3: verify before reporting done. ` +
        `Rule ${n}.4: never invent file contents. ` +
        `Rule ${n}.5: keep replies concise.`
    );
    words += perSection;
  }
  return sections.join('\n\n');
}

const FILLER = (i) =>
  `Step ${i}: listed the directory, read two files, confirmed the build passes. ` +
  `Detail ${i} recorded with enough words to make this turn meaningfully long. `.repeat(3);

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
      try {
        const j = JSON.parse(data);
        if (j.usage) usage = j.usage;
      } catch {
        /* ignore */
      }
    }
  }
  const input = usage?.prompt_tokens ?? 0;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return { prompt: input, cached };
}

async function post(body, attempt = 0) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    if ((res.status === 503 || res.status === 429) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2500));
      return post(body, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  }
  return collect(res);
}

async function send(arm, systemText, step) {
  const conversation = [];
  for (let i = 0; i < step; i += 1) {
    conversation.push({ role: 'user', content: FILLER(i) });
    conversation.push({ role: 'assistant', content: `Acknowledged step ${i}.` });
  }
  conversation.push({ role: 'user', content: 'Reply with exactly: ok' });

  const body = { model: MODEL, max_tokens: 4, temperature: 0, stream: true, stream_options: { include_usage: true } };
  if (arm === 'native') {
    body.messages = [{ role: 'system', content: systemText }, ...conversation];
    body.tools = TOOLS;
  } else {
    body.messages = [{ role: 'system', content: `${systemText}\n\n${renderCatalog(TOOLS)}` }, ...conversation];
  }
  return post(body);
}

for (const size of SIZES) {
  const system = makeSystem(size);
  const chars = system.length;
  console.log(`\n########## system ~${size} tokens (${chars} chars) ##########`);
  console.log('  step  arm     prompt   cached   rate');
  const out = { native: [], text: [] };
  for (let step = 0; step < STEPS; step += 1) {
    // Interleave so drift cannot favour one arm.
    for (const arm of ['native', 'text']) {
      const r = await send(arm, system, step);
      out[arm].push(r);
      const pct = r.prompt ? Math.round((r.cached / r.prompt) * 100) : 0;
      console.log(`  ${String(step).padStart(4)}  ${arm.padEnd(6)} ${String(r.prompt).padStart(7)} ${String(r.cached).padStart(8)} ${String(pct).padStart(5)}%`);
    }
  }
  console.log('  --- cached growth per step (the real question) ---');
  for (const arm of ['native', 'text']) {
    const list = out[arm];
    const deltas = list.slice(1).map((r, i) => r.cached - list[i].cached);
    const finals = list.at(-1);
    console.log(
      `  ${arm.padEnd(6)} cached: ${list.map((r) => r.cached).join(' -> ')}  ` +
        `| deltas ${deltas.join(',')} | final ${finals.prompt ? Math.round((finals.cached / finals.prompt) * 100) : 0}%`
    );
  }
}
