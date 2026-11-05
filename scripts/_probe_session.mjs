// Decode one DSH session log (concatenated zstd frames) and report routing facts.
// Usage: node scripts/_probe_session.mjs <session.v4.jsonl.zstd> [tailMessages]
import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

const file = process.argv[2];
const tail = Number(process.argv[3] ?? 6);
if (!file) {
  console.error('usage: node scripts/_probe_session.mjs <session.v4.jsonl.zstd> [tailMessages]');
  process.exit(2);
}

const buffer = readFileSync(file);
const offsets = [];
for (let index = 0; index < buffer.length - 3; index++) {
  if (buffer[index] === 0x28 && buffer[index + 1] === 0xb5 && buffer[index + 2] === 0x2f && buffer[index + 3] === 0xfd) {
    offsets.push(index);
  }
}
let text = '';
for (let index = 0; index < offsets.length; index++) {
  const start = offsets[index];
  const end = index + 1 < offsets.length ? offsets[index + 1] : buffer.length;
  try {
    text += zstdDecompressSync(buffer.subarray(start, end)).toString('utf8');
  } catch {
    // A truncated trailing frame is expected while a session is live.
  }
}

const events = text
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

console.log(`file: ${file}`);
console.log(`events: ${events.length}`);

const headers = events.filter((event) => event.type === 'request/header');
console.log(`--- request/header (${headers.length}) ---`);
for (const event of headers) {
  const config = event.data.header.config ?? {};
  const tools = event.data.header.tools;
  console.log(`seq ${event.seq} provider=${config.provider} model=${config.model} tools=${tools ? tools.length : 'NONE'} reason=${event.data.reason}`);
}

const messages = events.filter((event) => event.type === 'assistant/message');
console.log(`--- last ${Math.min(tail, messages.length)} assistant messages ---`);
for (const event of messages.slice(-tail)) {
  const blocks = event.data.message.content;
  const summary = blocks
    .map((block) => {
      if (block.type === 'tool-call') return `TOOL(${block.name})`;
      if (block.type === 'text') return `TEXT[${String(block.text ?? '').slice(0, 160).replace(/\n/g, '\\n')}]`;
      return block.type;
    })
    .join(' | ');
  const usage = event.data.usage ?? {};
  console.log(`seq ${event.seq} in=${usage.inputTokens ?? 0} cacheRead=${usage.cacheReadTokens ?? 0}`);
  console.log(`   ${summary}`);
}
