import fs from 'node:fs';

const file = '.scratch/asar/dsh/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js';
const source = fs.readFileSync(file, 'utf8');

const at = source.indexOf('function buildRequest');
console.log(source.slice(at, at + 3000));
