// Is the 503 caused by the `tools` field itself, or by payload size?
// Three probes, smallest first, so the answer is unambiguous.
import fs from 'node:fs';
import path from 'node:path';

const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const MODEL = 'deepseek-v4.1-flash';

const ONE_TOOL = {
  type: 'function',
  function: {
    name: 'read',
    description: 'Read a file from the workspace.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path to read.' } },
      required: ['path']
    }
  }
};

async function probe(label, body) {
  const bytes = Buffer.byteLength(JSON.stringify(body));
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body)
  });
  let note = '';
  if (!res.ok) {
    const text = await res.text();
    note = text.slice(0, 160).replace(/\s+/g, ' ');
  } else {
    // Drain so the connection is released.
    const decoder = new TextDecoder();
    for await (const part of res.body) void decoder.decode(part, { stream: true });
  }
  console.log(`  ${label.padEnd(34)} body=${String(bytes).padStart(6)}B  -> HTTP ${res.status}${note ? '  ' + note : ''}`);
  return res.status;
}

const base = {
  model: MODEL,
  max_tokens: 4,
  temperature: 0,
  stream: true,
  stream_options: { include_usage: true },
  messages: [{ role: 'user', content: 'Reply with exactly: ok' }]
};

console.log('=== probing what the gateway accepts ===');
await probe('no tools field', { ...base });
await probe('1 tool', { ...base, tools: [ONE_TOOL] });
await probe('1 tool, tools present but empty', { ...base, tools: [] });

const many = Array.from({ length: 32 }, (_, i) => ({
  ...ONE_TOOL,
  function: { ...ONE_TOOL.function, name: `tool_${i}` }
}));
await probe('32 tools (small schemas)', { ...base, tools: many });
