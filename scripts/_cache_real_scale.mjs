// The decisive comparison, at real scale, using the real conversation.
//
// Replay the actual messages from this session's log, and render them two ways:
//   native - the 32-tool catalogue in the `tools` field, catalogue removed from
//            the system prompt
//   text   - the catalogue appended to the system prompt, no `tools` field
//            (exactly what the plugin does)
// Then append a growing tail to each and compare how much of the prompt is
// served from cache. This is the question the company decision rests on.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const MODEL = process.argv[2] || 'deepseek-v4.1-flash';
const sessionPath = process.argv[3];
const STEPS = Number(process.argv[4] || 4);

/** Read the message history out of a v4 session log. */
function readSession(file) {
  const b = fs.readFileSync(file);
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const starts = [];
  for (let i = 0; i <= b.length - 4; i += 1) if (b.compare(magic, 0, 4, i, i + 4) === 0) starts.push(i);
  let text = '';
  for (let k = 0; k < starts.length; k += 1) {
    const end = k + 1 < starts.length ? starts[k + 1] : b.length;
    try {
      text += zlib.zstdDecompressSync(b.subarray(starts[k], end)).toString('utf8');
    } catch {
      /* torn frame */
    }
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const events = readSession(sessionPath);
const firstUser = events.find((e) => e.type === 'session' || e.type === 'request/context');

// Rebuild a system prompt + a few user/assistant exchanges from the log. The
// goal is realistic size, not exact fidelity.
const systemSections = (firstUser?.data?.system ?? []).join?.('\n\n') ?? '';
const baseSystem =
  (systemSections || `You are a coding agent operating in E:\\Projects\\DSH_Plugins_Dev.`) +
  '\n\n' +
  Array.from({ length: 40 }, (_, i) =>
    `## Section ${i}\nFollow rule ${i}.1: prefer the smallest sufficient change. ` +
    `Rule ${i}.2: quote paths verbatim and keep identifiers byte-exact. ` +
    `Rule ${i}.3: verify before reporting done. Rule ${i}.4: never invent file contents.`
  ).join('\n\n');

const KINDS = ['read', 'write', 'search', 'list', 'patch', 'glob', 'grep', 'run'];
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}

// 32 tools shaped like DSH's, ~32K chars total (matches catLen=31967).
const TOOLS = Array.from({ length: 32 }, (_, i) => ({
  type: 'function',
  function: {
    name: `tool_${String(i).padStart(2, '0')}_${KINDS[i % 8]}`,
    description:
      `Tool ${i} performs the ${KINDS[i % 8]} operation. Arguments are validated against the schema before use, ` +
      'paths resolve against the project root, and every invocation is recorded. '.repeat(14),
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the workspace root.' },
        pattern: { type: 'string', description: 'Glob or regular expression to match.' },
        recursive: { type: 'boolean', description: 'Whether to descend into subdirectories.' },
        limit: { type: 'number', description: 'Maximum number of results to return.' },
        encoding: { type: 'string', description: 'Text encoding to assume.' }
      },
      required: ['path'],
      additionalProperties: false
    }
  }
}));

function renderCatalog(tools) {
  const lines = ['Available tools (sorted by name; parameters are JSON Schema):'];
  for (const t of [...tools.map((x) => x.function)].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    lines.push(`- ${t.name}: ${t.description}`);
    lines.push(`  Parameters: ${stable(t.parameters)}`);
  }
  return lines.join('\n');
}

const CATALOG = renderCatalog(TOOLS);
console.log(`catalogue: ${CATALOG.length} chars (real DSH catalogue is 31967)`);

// A long conversation body, to reach realistic prompt sizes.
const turnText = (i) =>
  `Turn ${i}. I inspected the repository layout, read the persistence module, and confirmed the writer uses a checksum flag. ` +
  `The frame walker rejects reserved bits and requires the frame descriptor, so recompressed frames from Node are standard. ` +
  `Next I will patch lines by index and verify the relationships replay. `.repeat(4);

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
    if ((res.status === 503 || res.status === 429) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 3000));
      return post(body, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return collect(res);
}

/** Build the message list for one arm at one depth. */
function build(arm, depth) {
  const convo = [];
  for (let i = 0; i < depth; i += 1) {
    convo.push({ role: 'user', content: turnText(i) });
    convo.push({ role: 'assistant', content: `Acknowledged turn ${i}. I will continue.` });
  }
  convo.push({ role: 'user', content: 'Reply with exactly: ok' });

  const body = { model: MODEL, max_tokens: 4, temperature: 0, stream: true, stream_options: { include_usage: true } };
  if (arm === 'native') {
    body.messages = [{ role: 'system', content: baseSystem }, ...convo];
    body.tools = TOOLS;
  } else {
    body.messages = [{ role: 'system', content: `${baseSystem}\n\n${CATALOG}` }, ...convo];
  }
  return body;
}

const DEPTHS = process.env.DEPTHS ? process.env.DEPTHS.split(',').map(Number) : [2, 6, 14, 26];

console.log('\nstep  depth  arm     prompt    cached   rate   delta');
for (const depth of DEPTHS) {
  const out = { native: [], text: [] };
  for (let step = 0; step < STEPS; step += 1) {
    for (const arm of ['native', 'text']) {
      const r = await post(build(arm, depth + step));
      out[arm].push(r);
      const pct = r.prompt ? Math.round((r.cached / r.prompt) * 100) : 0;
      const prev = out[arm].length > 1 ? out[arm].at(-2) : null;
      const delta = prev === null ? '' : `+${r.cached - prev.cached}`;
      console.log(
        `  ${String(step).padStart(3)}  ${String(depth + step).padStart(5)}  ${arm.padEnd(6)} ` +
          `${String(r.prompt).padStart(7)} ${String(r.cached).padStart(9)} ${String(pct).padStart(5)}%  ${delta}`
      );
    }
  }
  console.log('  --- summary ---');
  for (const arm of ['native', 'text']) {
    const list = out[arm];
    const deltas = list.slice(1).map((r, i) => r.cached - list[i].cached);
    const promptGrew = list.at(-1).prompt - list[0].prompt;
    const cacheGrew = list.at(-1).cached - list[0].cached;
    const last = list.at(-1);
    console.log(
      `  ${arm.padEnd(6)} final ${last.prompt ? Math.round((last.cached / last.prompt) * 100) : 0}%  ` +
        `| prompt +${promptGrew} cached +${cacheGrew} (${promptGrew ? Math.round((cacheGrew / promptGrew) * 100) : 0}% tracked)`
    );
  }
  console.log('');
}
