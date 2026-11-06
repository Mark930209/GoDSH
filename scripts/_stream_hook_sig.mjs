// What does the `llm/stream` waterfall pass after `request`? If it carries an
// agent or context, the strike counter can be keyed per agent instead of per
// route, which is what the concurrent-subagent bug needs.
import fs from 'node:fs';
import path from 'node:path';

const root = 'E:\\Users\\congzhisen\\AppData\\Local\\Programs';
// The install directory's name is rewritten by the harness, so it cannot be
// hard-coded - resolve it by looking for the asar payload instead.
const dir = fs
  .readdirSync(root)
  .find((name) => fs.existsSync(path.join(root, name, 'resources', 'app.asar')));
if (!dir) throw new Error(`no app.asar found under ${root}`);
const asar = path.join(root, dir, 'resources', 'app.asar');
console.log('asar:', asar);

const buf = fs.readFileSync(asar);
const text = buf.toString('latin1');

// Find the emitter/declaration of `llm/stream` and print a window around each.
const needles = ['"llm/stream"', "'llm/stream'", 'llm/stream'];
const seen = new Set();
const hits = [];
for (const needle of needles) {
  let at = -1;
  while ((at = text.indexOf(needle, at + 1)) >= 0) {
    // Collapse near-duplicates.
    const bucket = Math.floor(at / 200);
    if (seen.has(bucket)) continue;
    seen.add(bucket);
    hits.push(at);
  }
}

console.log(`hits: ${hits.length}`);
for (const at of hits.slice(0, 24)) {
  const from = Math.max(0, at - 260);
  const to = Math.min(text.length, at + 320);
  const window = text.slice(from, to).replace(/[\x00-\x08\x0e-\x1f]/g, ' ');
  if (!/stream\s*[:(]|on\s*\(\s*['"]llm\/stream/.test(window)) continue;
  console.log(`\n--- @${at} ---`);
  console.log(window);
}
