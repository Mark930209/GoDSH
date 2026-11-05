// Check whether the system prompt carries volatile text that breaks the prefix.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

function readSession(file) {
  const buf = fs.readFileSync(file);
  const offsets = [];
  for (let i = 0; i < buf.length - 3; i += 1) {
    if (MAGIC.every((byte, k) => buf[i + k] === byte)) offsets.push(i);
  }
  let text = '';
  for (let k = 0; k < offsets.length; k += 1) {
    const start = offsets[k];
    const end = k + 1 < offsets.length ? offsets[k + 1] : buf.length;
    try {
      text += zlib.zstdDecompressSync(buf.subarray(start, end)).toString('utf8');
    } catch {
      /* skip */
    }
  }
  return text
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
}

const textOf = (content) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((block) => block?.type === 'text').map((block) => block.text ?? '').join('');
};
const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 10);

const events = readSession(process.argv[2]);
const counts = new Map();
for (const event of events) counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
console.log('event types:');
for (const [type, count] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
  console.log(`  ${String(count).padStart(5)}  ${type}`);
}

const systems = [];
for (const event of events) {
  if (event.type !== 'system/message') continue;
  systems.push({ seq: event.seq, text: textOf(event.data?.message?.content) });
}
console.log(`\nsystem/message events: ${systems.length}`);
const hashes = [...new Set(systems.map((entry) => hash(entry.text)))];
console.log(`distinct: ${hashes.length}`);

// Where do consecutive system prompts first diverge?
for (let i = 1; i < systems.length; i += 1) {
  const left = systems[i - 1].text;
  const right = systems[i].text;
  if (left === right) continue;
  let at = 0;
  while (at < left.length && at < right.length && left[at] === right[at]) at += 1;
  console.log(`\nseq ${systems[i].seq}: diverges at byte ${at} (len ${left.length} -> ${right.length})`);
  console.log(`   before: ${JSON.stringify(left.slice(Math.max(0, at - 60), at))}`);
  console.log(`   left  : ${JSON.stringify(left.slice(at, at + 120))}`);
  console.log(`   right : ${JSON.stringify(right.slice(at, at + 120))}`);
  if (i > 6) break;
}

if (systems.length > 0) {
  const text = systems[systems.length - 1].text;
  const patterns = {
    isoTime: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    clock: /\b\d{1,2}:\d{2}(:\d{2})?\b/,
    dateOnly: /\b\d{4}-\d{2}-\d{2}\b/,
    timezone: /Asia\/Shanghai|UTC[+-]\d/,
    git: /\b(git|branch|commit)\b/i
  };
  console.log('\nvolatile markers in the latest system prompt:');
  for (const [label, pattern] of Object.entries(patterns)) {
    const match = pattern.exec(text);
    console.log(`  ${label}: ${match ? JSON.stringify(text.slice(Math.max(0, match.index - 40), match.index + 60)) : 'no'}`);
  }
  console.log(`\nsystem prompt length: ${text.length}`);
  console.log('--- head ---');
  console.log(text.slice(0, 600));
  console.log('--- tail ---');
  console.log(text.slice(-900));
}
