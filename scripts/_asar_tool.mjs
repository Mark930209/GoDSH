// Minimal ASAR reader (offline). Usage:
//   node _asar_tool.mjs list <asar> [prefix]
//   node _asar_tool.mjs extract <asar> <outDir> <prefix>
import fs from 'node:fs';
import path from 'node:path';

const cmd = process.argv[2];
const asar = process.argv[3];

const fd = fs.openSync(asar, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const u32_0 = head.readUInt32LE(0);
const u32_4 = head.readUInt32LE(4);
const u32_8 = head.readUInt32LE(8);

function tryHeader(start, len) {
  if (len <= 0 || len > 100 * 1024 * 1024) return null;
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, start);
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return null;
  }
}

const u32_12 = head.readUInt32LE(12);
let headerStart = -1;
let headerLen = -1;
let header = null;
for (let start = 8; start < 48 && !header; start++) {
  for (const len of [u32_12, u32_8, u32_4]) {
    header = tryHeader(start, len);
    if (header) { headerStart = start; headerLen = len; break; }
  }
}
if (!header) throw new Error(`cannot parse asar header (u32: ${u32_0},${u32_4},${u32_8})`);

const baseOffset = headerStart + headerLen;
if (cmd === 'list') {
  const prefix = process.argv[4] || '';
  const out = [];
  function walk(node, rel) {
    if (!node || !node.files) return;
    for (const [name, child] of Object.entries(node.files)) {
      const p = rel ? `${rel}/${name}` : name;
      if (child.files) walk(child, p);
      else {
        if (p.startsWith(prefix)) out.push([p, child.size ?? 0, child.unpacked ? 'U' : '']);
      }
    }
  }
  walk(header, '');
  out.sort((a, b) => a[0].localeCompare(b[0]));
  for (const [p, size, flag] of out) console.log(`${flag}\t${size}\t${p}`);
  console.log(`# total ${out.length} files; headerBase=${baseOffset}`);
} else if (cmd === 'extract') {
  const outDir = process.argv[4];
  const prefix = process.argv[5] || '';
  let n = 0;
  function walk(node, rel) {
    if (!node || !node.files) return;
    for (const [name, child] of Object.entries(node.files)) {
      const p = rel ? `${rel}/${name}` : name;
      if (child.files) { walk(child, p); continue; }
      if (!p.startsWith(prefix)) continue;
      const dest = path.join(outDir, p);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (child.unpacked) {
        // unpacked files live beside the asar
        const unpacked = `${asar}.unpacked/${p}`;
        if (fs.existsSync(unpacked)) fs.copyFileSync(unpacked, dest);
        else console.log(`# missing unpacked ${p}`);
        continue;
      }
      const buf = Buffer.alloc(child.size);
      fs.readSync(fd, buf, 0, child.size, baseOffset + Number(child.offset));
      fs.writeFileSync(dest, buf);
      n++;
    }
  }
  walk(header, '');
  console.log(`# extracted ${n} files to ${outDir}`);
}
fs.closeSync(fd);
