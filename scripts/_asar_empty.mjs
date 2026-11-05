import fs from 'node:fs';
const p = 'E:\\Users\\congzhisen\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\app.asar';
const b = fs.readFileSync(p);
for (const needle of ['EMPTY_RESPONSE', 'ended the turn without an answer']) {
  const n = Buffer.from(needle);
  let i = 0;
  const hits = [];
  while ((i = b.indexOf(n, i)) !== -1) { hits.push(i); i += 1; }
  console.log('\n#####', needle, 'hits:', hits.length);
  for (const off of hits.slice(0, 4)) {
    console.log('\n--- @' + off + ' ---');
    console.log(b.subarray(Math.max(0, off - 400), off + 260).toString('utf8').replace(/\u0000/g, '.'));
  }
}
