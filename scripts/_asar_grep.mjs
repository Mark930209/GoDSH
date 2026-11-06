import fs from 'node:fs';
import path from 'node:path';

// The install folder is not literally "[DSH]" - the harness rewrites its own
// name to that alias in displayed output. Resolve the asar by walking the
// standard Electron install instead of hardcoding the name.
function findAsar() {
  const roots = [
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs'),
    'E:\\Users\\congzhisen\\AppData\\Local\\Programs'
  ];
  for (const root of roots) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const candidate = path.join(root, e.name, 'resources', 'app.asar');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const asar = findAsar();
if (!asar) { console.error('app.asar not found'); process.exit(1); }
console.log('asar:', asar.replace(/[^\\/]+Harness/g, '<install>'));
const b = fs.readFileSync(asar);

const needles = process.argv.slice(2);
for (const needle of needles) {
  const n = Buffer.from(needle);
  let i = 0;
  const hits = [];
  while ((i = b.indexOf(n, i)) !== -1) { hits.push(i); i += 1; }
  console.log('\n########', needle, '=>', hits.length, 'hits');
  for (const off of hits.slice(0, 5)) {
    console.log('\n--- @' + off + ' ---');
    console.log(b.subarray(Math.max(0, off - 400), off + 400).toString('utf8').replace(/\u0000/g, '.'));
  }
}
