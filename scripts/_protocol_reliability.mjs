// Beyond caching: does the text protocol actually work reliably?
//
// The caching question is only half of it. If the plugin is retained it must at
// least deliver correct tool calls, and if it is dropped the company needs to
// know what changes. This measures the parse rate directly: send a task that
// requires a tool call, in both shapes, and count how often the model emits a
// well-formed call.
import fs from 'node:fs';
import path from 'node:path';

const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const MODEL = process.argv[2] || 'deepseek-v4.1-flash';
const TRIALS = Number(process.argv[3] || 10);

const MARKER = '@@TOOL@@';
const TOOLS = [
  {
    name: 'read',
    description: 'Read a UTF-8 text file and return its content with line numbers.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute or workspace-relative path.' },
        limit: { type: 'number', description: 'Maximum lines to return.' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'glob',
    description: 'Find files whose paths match a glob pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob such as **/*.ts.' },
        path: { type: 'string', description: 'Directory to search.' }
      },
      required: ['pattern']
    }
  }
];

const wire = TOOLS.map((t) => ({ type: 'function', function: t }));

function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const k = Object.keys(v).sort();
  return `{${k.map((x) => `${JSON.stringify(x)}:${stable(v[x])}`).join(',')}}`;
}

const PROTOCOL =
  'You have tools available. To call one, emit exactly one line of the form:\n' +
  `${MARKER} {"name": "<tool name>", "arguments": { ... }}\n` +
  'Emit the call and nothing else when a tool is needed.';

function catalog() {
  const lines = ['Available tools (sorted by name; parameters are JSON Schema):'];
  for (const t of TOOLS) {
    lines.push(`- ${t.name}: ${t.description}`);
    lines.push(`  Parameters: ${stable(t.parameters)}`);
  }
  return lines.join('\n');
}

// A task with an unambiguous correct answer.
const TASK = 'Read the file at E:\\Projects\\DSH_Plugins_Dev\\README.md. Use a tool to do it.';

async function send(arm) {
  const body = {
    model: MODEL,
    max_tokens: 400,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true }
  };
  if (arm === 'native') {
    body.messages = [
      { role: 'system', content: 'You are a coding agent with tools.' },
      { role: 'user', content: TASK }
    ];
    body.tools = wire;
  } else {
    body.messages = [
      { role: 'system', content: `You are a coding agent with tools.\n\n${PROTOCOL}\n\n${catalog()}` },
      { role: 'user', content: TASK }
    ];
  }

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const nativeCalls = [];
  let finish = null;
  for await (const part of res.body) {
    buffer += decoder.decode(part, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let j;
      try {
        j = JSON.parse(data);
      } catch {
        continue;
      }
      const choice = j.choices?.[0];
      if (choice?.delta?.content) text += choice.delta.content;
      if (Array.isArray(choice?.delta?.tool_calls)) {
        for (const tc of choice.delta.tool_calls) {
          const idx = tc.index ?? 0;
          nativeCalls[idx] = nativeCalls[idx] ?? { name: '', arguments: '' };
          if (tc.function?.name) nativeCalls[idx].name += tc.function.name;
          if (tc.function?.arguments) nativeCalls[idx].arguments += tc.function.arguments;
        }
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
    }
  }
  return { text, nativeCalls: nativeCalls.filter(Boolean), finish };
}

/** Does the body contain a parsable text-protocol call? Mirrors the plugin. */
function parseTextCall(text) {
  const at = text.indexOf(MARKER);
  if (at < 0) return null;
  const rest = text.slice(at + MARKER.length);
  const brace = rest.indexOf('{');
  if (brace < 0) return null;
  // Walk to the matching close brace.
  let depth = 0;
  let inString = false;
  let esc = false;
  for (let i = brace; i < rest.length; i += 1) {
    const ch = rest[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(rest.slice(brace, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const results = { native: [], text: [] };
for (let i = 0; i < TRIALS; i += 1) {
  for (const arm of ['native', 'text']) {
    try {
      const r = await send(arm);
      let ok;
      let how;
      if (arm === 'native') {
        ok = r.nativeCalls.length > 0;
        how = ok ? `native tool_calls=${r.nativeCalls.length}` : `no tool_calls (finish=${r.finish})`;
      } else {
        const parsed = parseTextCall(r.text);
        ok = parsed !== null && typeof parsed.name === 'string' && parsed.name.length > 0;
        // Also record whether the provider volunteered a native call even
        // though we sent no `tools` field.
        how = ok
          ? `text call name=${parsed.name}${r.nativeCalls.length ? ' (also native)' : ''}`
          : `unparsable (finish=${r.finish}, ${r.text.slice(0, 60).replace(/\s+/g, ' ')})`;
      }
      results[arm].push({ ok, how });
    } catch (e) {
      results[arm].push({ ok: false, how: `error ${String(e).slice(0, 60)}` });
    }
    process.stdout.write('.');
  }
}

console.log('\n\n=== tool-call reliability ===');
for (const [arm, list] of Object.entries(results)) {
  const ok = list.filter((r) => r.ok).length;
  console.log(`  ${arm.padEnd(7)} ${ok}/${list.length} produced a usable call (${Math.round((ok / list.length) * 100)}%)`);
  for (const r of list.filter((x) => !x.ok).slice(0, 3)) console.log(`      miss: ${r.how}`);
}
