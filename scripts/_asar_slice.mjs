import fs from 'node:fs';
import path from 'node:path';

function findAsar() {
  const roots = [path.join(process.env.LOCALAPPDATA ?? '', 'Programs'), 'E:\\Users\\congzhisen\\AppData\\Local\\Programs'];
  for (const root of roots) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const c = path.join(root, e.name, 'resources', 'app.asar');
      if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

const asar = findAsar();
const b = fs.readFileSync(asar);
const wanted = process.argv.slice(2).map(Number);
for (const [i, off] of wanted.entries()) {
  const from = Number.isFinite(off) ? off : 0;
  console.log(`\n===== slice ${i} from ${from} =====`);
  console.log(b.subarray(from, from + (Number(process.env.LEN) || 3200)).toString('utf8').replace(/\u0000/g, '.'));
}
