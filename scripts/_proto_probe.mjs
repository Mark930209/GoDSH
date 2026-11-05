// Protocol probe: does the gateway model emit @@TOOL@@ in its STREAMED content
// when the tool catalog lives in the system prompt and `tools` is absent, and
// does our transformer reassemble the call?
import fs from 'node:fs';
import path from 'node:path';
import { renderToolCatalog, createInboundTransform } from '../plugins/n1n-prompt-tools/index.js';

const MODELS = process.argv[2] ? process.argv[2].split(',') : ['deepseek-v4.1-flash'];
const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const TOOLS = JSON.parse(fs.readFileSync('E:/Projects/DSH_Plugins_Dev/.scratch/tools_real.json', 'utf8'));

const system = [
  'You are a coding agent working in E:\\Projects\\DSH_Plugins_Dev.',
  'You have file tools. Follow the tool protocol exactly.',
  '',
  renderToolCatalog(TOOLS, { marker: '@@TOOL@@' })
].join('\n');

const messages = [
  { role: 'system', content: system },
  { role: 'user', content: 'Please read the file a.txt (relative to the working directory) and tell me what it says. Use the read tool.' }
];

async function streamOnce(model) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, messages, max_tokens: 400, temperature: 0, stream: true, stream_options: { include_usage: true } })
  });
  if (!res.ok) {
    console.log(model, 'HTTP', res.status, (await res.text()).slice(0, 400));
    return;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';
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
      const json = JSON.parse(data);
      if (json.usage) usage = json.usage;
      const delta = json.choices?.[0]?.delta;
      if (delta?.reasoning_content) reasoning += delta.reasoning_content;
      if (delta?.content) content += delta.content;
    }
  }

  // Feed the streamed content through the transformer exactly like llm/stream would.
  const chunks = [];
  chunks.push({ type: 'block-start', index: 0, blockType: 'reasoning' });
  if (reasoning) chunks.push({ type: 'reasoning-delta', index: 0, text: reasoning });
  chunks.push({ type: 'block-end', index: 0, block: { type: 'reasoning', text: reasoning } });
  chunks.push({ type: 'block-start', index: 1, blockType: 'text' });
  chunks.push({ type: 'text-delta', index: 1, text: content });
  chunks.push({ type: 'block-end', index: 1, block: { type: 'text', text: content } });
  if (usage) chunks.push({ type: 'usage', usage });
  chunks.push({ type: 'finish', reason: { kind: 'stop' } });

  const source = (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
  const out = [];
  for await (const chunk of createInboundTransform(source, { marker: '@@TOOL@@' })) out.push(chunk);
  const text = out.filter((c) => c.type === 'text-delta').map((c) => c.text).join('');
  const calls = out.filter((c) => c.type === 'block-end' && c.block.type === 'tool-call').map((c) => c.block);

  console.log('=====', model);
  console.log('raw content:', JSON.stringify(content));
  console.log('tool calls:', JSON.stringify(calls));
  console.log('visible text after transform:', JSON.stringify(text));
  console.log('usage.cached:', usage?.prompt_tokens_details?.cached_tokens, 'prompt:', usage?.prompt_tokens);
}

for (const model of MODELS) await streamOnce(model);
