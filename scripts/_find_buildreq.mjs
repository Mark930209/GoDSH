import fs from 'node:fs';

const file = '.scratch/asar/dsh/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js';
const source = fs.readFileSync(file, 'utf8');

const hits = [];
let at = source.indexOf('buildRequest');
while (at >= 0) {
  hits.push(at);
  at = source.indexOf('buildRequest', at + 1);
}
console.log('occurrences:', hits);

// The definition is the one followed by a parameter list and a brace body.
const defAt = hits.find((index) => source.slice(index, index + 40).includes('(') && /^\s*buildRequest\s*\(/.test(source.slice(index - 10, index + 20)));
console.log('defAt', defAt);
if (defAt !== undefined) {
  fs.writeFileSync('.scratch/buildreq_def.txt', source.slice(defAt - 200, defAt + 3000), 'utf8');
}
