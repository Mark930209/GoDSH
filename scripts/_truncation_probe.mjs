// Scan a session for assistant replies that look truncated mid-markup.
import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const buf = fs.readFileSync(file);
const offsets = [];
for (let i = 0; i < buf.length - 3; i++) {
  if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) offsets.push(i);
}
let text = '';
for (let k = 0; k < offsets.length; k++) {
  const start = offsets[k];
  const end = k + 1 < offsets.length ? offsets[k + 1] : buf.length;
  try {
    text += zlib.zstdDecompressSync(buf.subarray(start, end)).toString('utf8');
  } catch {
    /* skip a damaged frame */
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

let route = '?';
let total = 0;
const odd = [];
const noCall = [];

for (const event of events) {
  if (event.type === 'request/header') {
    route = `${event.data.header.config.provider}/${event.data.header.config.model}`;
    continue;
  }
  if (event.type !== 'assistant/message') continue;
  total += 1;
  const content = event.data.message.content || [];
  const body = content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  const calls = content.filter((block) => block.type === 'tool-call').length;
  const trimmed = body.trimEnd();
  const last = trimmed.slice(-1);
  const suspicious = last === '`' || last === '<' || last === '\uFF5C' || last === '|';
  if (suspicious) odd.push({ seq: event.seq, route, len: body.length, last, tail: trimmed.slice(-36), calls });
  if (calls === 0) noCall.push({ seq: event.seq, route, len: body.length, tail: trimmed.slice(-36), tokens: event.data.usage?.outputTokens });
}

console.log(`assistant messages: ${total}; without tool call: ${noCall.length}`);
console.log('\n--- replies ending on an opening markup character ---');
for (const item of odd) console.log(` seq ${item.seq} ${item.route} len=${item.len} calls=${item.calls} last=${JSON.stringify(item.last)}\n   ${JSON.stringify(item.tail)}`);

console.log('\n--- replies with no tool call (last 8) ---');
for (const item of noCall.slice(-8)) console.log(` seq ${item.seq} ${item.route} len=${item.len} out=${item.tokens}\n   ${JSON.stringify(item.tail)}`);
