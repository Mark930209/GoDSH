// Correlate cache hit rate with the gap since the previous request (TTL theory)
// and with request-header changes. Usage: node scripts/_cache_ttl.mjs <file...>
import fs from 'node:fs';
import zlib from 'node:zlib';

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

function readSession(file) {
  const buf = fs.readFileSync(file);
  const offsets = [];
  for (let i = 0; i < buf.length - 3; i += 1) {
    if (MAGIC.every((b, k) => buf[i + k] === b)) offsets.push(i);
  }
  let text = '';
  for (let k = 0; k < offsets.length; k += 1) {
    const start = offsets[k];
    const end = k + 1 < offsets.length ? offsets[k + 1] : buf.length;
    try {
      text += zlib.zstdDecompressSync(buf.subarray(start, end)).toString('utf8');
    } catch {
      /* skip */
    }
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

for (const file of process.argv.slice(2)) {
  const events = readSession(file);
  let route = '?';
  let toolCount = -1;
  let lastHeaderSeq = -1;
  const rows = [];
  for (const event of events) {
    if (event.type === 'request/header') {
      const config = event.data?.header?.config ?? {};
      route = `${config.provider ?? '?'}/${config.model ?? '?'}`;
      toolCount = (event.data?.header?.tools ?? []).length;
      lastHeaderSeq = event.seq;
      continue;
    }
    if (event.type !== 'assistant/message') continue;
    const usage = event.data?.usage;
    if (!usage) continue;
    const prompt = Number(usage.inputTokens ?? 0) + Number(usage.cacheReadTokens ?? 0);
    if (prompt <= 0) continue;
    rows.push({
      seq: event.seq,
      time: event.time,
      route,
      tools: toolCount,
      headerSeq: lastHeaderSeq,
      prompt,
      rate: (100 * Number(usage.cacheReadTokens ?? 0)) / prompt
    });
  }

  // Bucket consecutive steps by the gap to the previous assistant message.
  const buckets = new Map();
  for (let i = 1; i < rows.length; i += 1) {
    const gapMin = (rows[i].time - rows[i - 1].time) / 60000;
    let label;
    if (gapMin < 1) label = '<1min';
    else if (gapMin < 3) label = '1-3min';
    else if (gapMin < 6) label = '3-6min';
    else if (gapMin < 15) label = '6-15min';
    else if (gapMin < 45) label = '15-45min';
    else label = '45min+';
    const bucket = buckets.get(label) ?? { n: 0, sum: 0, zero: 0 };
    bucket.n += 1;
    bucket.sum += rows[i].rate;
    if (rows[i].rate < 5) bucket.zero += 1;
    buckets.set(label, bucket);
  }

  console.log(`\n=== ${file}`);
  console.log(`route=${route} tools=${toolCount} rows=${rows.length}`);
  const order = ['<1min', '1-3min', '3-6min', '6-15min', '15-45min', '45min+'];
  for (const label of order) {
    const bucket = buckets.get(label);
    if (!bucket) continue;
    console.log(
      `  gap ${label.padEnd(9)} n=${String(bucket.n).padStart(4)}  avg rate ${bucket.sum === 0 ? '0.0' : (bucket.sum / bucket.n).toFixed(1).padStart(5)}%  ~zero hits ${bucket.zero}`
    );
  }
}
