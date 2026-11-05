// Exhaustive split fuzz: does any chunk boundary make the DSML block leak?
import fs from 'node:fs';
import { createInboundTransform } from '../plugins/n1n-prompt-tools/index.js';

const text = fs.readFileSync('.scratch/dsml_leak.txt', 'utf8');
const options = { marker: '@@TOOL@@', emptyResponseGuard: true, argumentTypes: {} };

async function run(pieces) {
  const source = (async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' };
    for (const piece of pieces) if (piece.length > 0) yield { type: 'text-delta', index: 0, text: piece };
    yield { type: 'block-end', index: 0, block: { type: 'text', text } };
    yield { type: 'finish', reason: 'stop' };
  })();
  const blocks = [];
  for await (const chunk of createInboundTransform(source, options)) {
    if (chunk.type === 'block-end') blocks.push(chunk.block);
  }
  const calls = blocks.filter((b) => b?.type === 'tool-call');
  const shown = blocks.filter((b) => b?.type === 'text').map((b) => b.text).join('');
  return { calls: calls.length, leaks: /DSML/.test(shown) };
}

const failures = [];
for (let i = 1; i < text.length; i += 1) {
  const result = await run([text.slice(0, i), text.slice(i)]);
  if (result.calls !== 2 || result.leaks) failures.push({ split: i, ...result, context: JSON.stringify(text.slice(i - 25, i + 25)) });
}
console.log(`2-way splits: ${text.length - 1} tried, ${failures.length} failed`);
for (const f of failures.slice(0, 20)) console.log(' ', f.split, 'calls=' + f.calls, 'leaks=' + f.leaks, f.context);

// 3-way at a coarse grid, in case two boundaries interact
const grid = [];
for (let i = 20; i < text.length - 20; i += 37) for (let j = i + 20; j < text.length - 20; j += 53) grid.push([i, j]);
let fail3 = 0;
const fail3samples = [];
for (const [i, j] of grid) {
  const result = await run([text.slice(0, i), text.slice(i, j), text.slice(j)]);
  if (result.calls !== 2 || result.leaks) {
    fail3 += 1;
    if (fail3samples.length < 10) fail3samples.push({ i, j, ...result });
  }
}
console.log(`3-way splits: ${grid.length} tried, ${fail3} failed`);
for (const f of fail3samples) console.log(' ', f);
