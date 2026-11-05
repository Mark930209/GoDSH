// Timeline of prompt-cache behaviour for one or more DSH sessions.
// Usage: node scripts/_cache_timeline.mjs <session.v4.jsonl.zstd> [...]
import fs from 'node:fs';
import zlib from 'node:zlib';

function readSession(file) {
  const buf = fs.readFileSync(file);
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const starts = [];
  for (let i = 0; i <= buf.length - 4; i += 1) if (buf.compare(magic, 0, 4, i, i + 4) === 0) starts.push(i);
  const out = [];
  for (let k = 0; k < starts.length; k += 1) {
    const end = k + 1 < starts.length ? starts[k + 1] : buf.length;
    try {
      const text = zlib.zstdDecompressSync(buf.subarray(starts[k], end)).toString('utf8');
      for (const line of text.split('\n')) if (line.trim()) out.push(JSON.parse(line));
    } catch {
      /* torn frame */
    }
  }
  return out;
}

const fmtTime = (ms) => new Date(ms).toLocaleTimeString('zh-CN', { hour12: false });

for (const file of process.argv.slice(2)) {
  const events = readSession(file);
  let route = '?';
  let tools = -1;
  const rows = [];
  for (const event of events) {
    if (event.type === 'request/header') {
      const cfg = event.data?.header?.config ?? {};
      route = `${cfg.provider ?? '?'}/${cfg.model ?? '?'}`;
      tools = (event.data?.header?.tools ?? []).length;
      continue;
    }
    if (event.type !== 'assistant/message' || !event.data?.usage) continue;
    const u = event.data.usage;
    const prompt = Number(u.inputTokens ?? 0) + Number(u.cacheReadTokens ?? 0);
    if (prompt <= 0) continue;
    rows.push({
      t: event.time,
      route,
      tools,
      prompt,
      cached: Number(u.cacheReadTokens ?? 0),
      out: Number(u.outputTokens ?? 0),
      rate: (100 * Number(u.cacheReadTokens ?? 0)) / prompt,
    });
  }
  console.log(`\n=== ${file}`);
  console.log(`requests=${rows.length}`);
  // contiguous runs by (route, tools)
  const runs = [];
  for (const row of rows) {
    const last = runs.at(-1);
    if (last && last.route === row.route && last.tools === row.tools) {
      last.n += 1;
      last.end = row.t;
      last.prompt += row.prompt;
      last.cached += row.cached;
      last.rates.push(row.rate);
    } else runs.push({ ...row, n: 1, end: row.t, prompt: row.prompt, cached: row.cached, rates: [row.rate] });
  }
  for (const run of runs) {
    const avg = run.rates.reduce((a, b) => a + b, 0) / run.rates.length;
    console.log(
      `${fmtTime(run.t)} → ${fmtTime(run.end)}  ${run.route}  hdrTools=${String(run.tools).padStart(2)}  n=${String(run.n).padStart(3)}` +
        `  avg=${avg.toFixed(1).padStart(5)}%  weighted=${((100 * run.cached) / run.prompt).toFixed(1).padStart(5)}%`
    );
  }
  // per-request trace: look for saturation of cacheRead
  const trace = rows.map((r) => `${fmtTime(r.t)} t=${String(r.tools).padStart(2)} p=${String(r.prompt).padStart(6)} c=${String(r.cached).padStart(6)} ${r.rate.toFixed(0).padStart(3)}%`);
  fs.writeFileSync(file + '.timeline.txt', trace.join('\n'));
  console.log(`trace → ${file}.timeline.txt`);
}
