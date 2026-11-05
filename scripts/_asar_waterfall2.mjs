import fs from 'node:fs';
const p = 'E:\\Users\\congzhisen\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar';
const b = fs.readFileSync(p);
// Find the EventBus waterfall method definition.
const needle = Buffer.from('waterfall');
let i = 0;
const hits = [];
while ((i = b.indexOf(needle, i)) !== -1) { hits.push(i); i += 1; }
console.log('total hits:', hits.length);
let shown = 0;
for (const off of hits) {
  const s = b.subarray(Math.max(0, off - 120), off + 900).toString('utf8');
  // The definition chains `next` through listeners.
  if (!/upsertDict|next\b/.test(s)) continue;
  if (!/(reduceRight|reduce\(|chain)/.test(s)) continue;
  console.log('\n=== @' + off + ' ===\n' + s.replace(/\u0000/g, '.'));
  if (++shown >= 3) break;
}
