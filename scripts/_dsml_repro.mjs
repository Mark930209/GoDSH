// Feed the leaked DSML text through the plugin's real stream transform.
import fs from 'node:fs';
import { createInboundTransform } from '../plugins/n1n-prompt-tools/index.js';

const text = fs.readFileSync('.scratch/dsml_leak.txt', 'utf8');

async function run(chunks, label) {
  const source = (async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' };
    for (const piece of chunks) yield { type: 'text-delta', index: 0, text: piece };
    yield { type: 'block-end', index: 0, block: { type: 'text', text } };
  })();
  const out = [];
  for await (const chunk of createInboundTransform(source, { argumentTypes: {} })) out.push(chunk);
  const blocks = out.filter((c) => c.type === 'block-end').map((c) => c.block);
  const calls = blocks.filter((b) => b.type === 'tool-call');
  const texts = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  console.log(`\n### ${label}`);
  console.log('blocks:', blocks.map((b) => b.type).join(','));
  console.log('tool-calls:', calls.length, calls.map((c) => c.name));
  console.log('visible text len:', texts.length, '| still has DSML:', /DSML/.test(texts));
  if (/DSML/.test(texts)) console.log('leaked sample:\n' + texts.slice(0, 300));
}

// whole text in one chunk
await run([text], 'single chunk');
// char-by-char (worst case streaming)
await run([...text], '1-char chunks');
// realistic 7-char chunks
const pieces = [];
for (let i = 0; i < text.length; i += 7) pieces.push(text.slice(i, i + 7));
await run(pieces, '7-char chunks');
