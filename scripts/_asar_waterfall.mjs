import fs from 'node:fs';
const p = 'E:\\Users\\congzhisen\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar';
const b = fs.readFileSync(p);
const needle = Buffer.from('waterfall(');
let i = 0;
const hits = [];
while ((i = b.indexOf(needle, i)) !== -1) { hits.push(i); i += 1; }
console.log('waterfall( hits:', hits.length);
let shown = 0;
for (const off of hits) {
  const s = b.subarray(Math.max(0, off - 260), off + 700).toString('utf8');
  if (!/(listeners|middleware|Bail|parallel|Promise\.all|async \*|return next)/i.test(s)) continue;
  console.log('\n=== @' + off + ' ===\n' + s.replace(/\u0000/g, '.'));
  if (++shown >= 5) break;
}
