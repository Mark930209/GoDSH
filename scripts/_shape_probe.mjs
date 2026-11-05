import fs from 'node:fs';
import path from 'node:path';
const cred = fs.readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8');
const KEY = cred.match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const MODEL = 'deepseek-v4.1-flash';

const messages = [
  { role: 'system', content: 'You are a tool-using assistant. Tool catalog lives in this prompt.\n\n# Tools\nread(path)\n@@TOOL@@ {"name":"read","arguments":{"path":"a.txt"}}' },
  { role: 'user', content: 'Please read a.txt for me.' },
  { role: 'assistant', content: 'I will read it.', tool_calls: [
      { id: 'call_abc123', type: 'function', function: { name: 'read', arguments: '{"path":"a.txt"}' } },
    ] },
  { role: 'tool', tool_call_id: 'call_abc123', content: 'hello world from a.txt' },
  { role: 'user', content: 'What did the file say? Reply in one short sentence.' },
];

async function run(label, body) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`--- ${label}: HTTP ${res.status}`);
  console.log(text.slice(0, 700));
}

await run('no-tools-field + tool_calls history', { model: MODEL, messages, max_tokens: 32, temperature: 0, stream: false });

// control: same but tool msg replaced by plain user text (fully text protocol)
const messages2 = [
  messages[0],
  messages[1],
  { role: 'assistant', content: '@@TOOL@@ {"name":"read","arguments":{"path":"a.txt"}}' },
  { role: 'user', content: 'Tool result (read): hello world from a.txt' },
  { role: 'user', content: 'What did the file say? Reply in one short sentence.' },
];
await run('pure-text tool protocol history', { model: MODEL, messages: messages2, max_tokens: 32, temperature: 0, stream: false });
