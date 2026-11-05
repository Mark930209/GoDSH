import fs from 'node:fs';

const file = '.scratch/asar/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js';
const source = fs.readFileSync(file, 'utf8');

for (const pattern of ['llm/stream', 'system-prompt/assemble']) {
  let at = source.indexOf(pattern);
  let seen = 0;
  while (at >= 0 && seen < 3) {
    console.log(`=== ${pattern} @${at} ===`);
    console.log(source.slice(Math.max(0, at - 800), at + 500));
    console.log('');
    at = source.indexOf(pattern, at + 1);
    seen += 1;
  }
}
