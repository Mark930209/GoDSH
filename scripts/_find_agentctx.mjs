import fs from 'node:fs';

const file = '.scratch/asar/dsh/node_modules/@deepseek-ai/dsh-agent/lib/index.js';
const source = fs.readFileSync(file, 'utf8');

const lines = source.split('\n');
const want = ['class Agent', 'fork(', 'scoped', 'createScope', 'agent.ctx', 'this.ctx =', 'enter(agent'];
for (const needle of want) {
  const found = [];
  source.split('\n').forEach((line, index) => {
    if (line.includes(needle)) found.push(`${index + 1}: ${line.trim()}`);
  });
  if (found.length > 0) {
    console.log(`=== ${needle} (${found.length}) ===`);
    console.log(found.slice(0, 8).join('\n'));
    console.log('');
  }
}
