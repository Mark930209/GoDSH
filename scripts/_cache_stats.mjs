// Cache-hit behaviour: per-run table, per-turn step-1 vs later steps.
// Usage: node scripts/_cache_stats.mjs <session.v4.jsonl.zstd> [...]
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
      /* torn */
    }
  }
  return out;
}

const clock = (ms) => new Date(ms).toLocaleTimeString('zh-CN', { hour12: false });

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
    rows.push({ t: event.time, turn: event.data.turn, step: event.data.step, route, tools, prompt, cached: Number(u.cacheReadTokens ?? 0) });
  }
  const runs = [];
  for (const row of rows) {
    const last = runs.at(-1);
    const hit = row.cached / row.prompt > 0.8;
    const miss = row.cached / row.prompt < 0.05;
    if (last && last.route === row.route && last.tools === row.tools) {
      Object.assign(last, { end: row.t, n: last.n + 1, hits: last.hits + (hit ? 1 : 0), misses: last.misses + (miss ? 1 : 0), prompt: last.prompt + row.prompt, cached: last.cached + row.cached, maxPrompt: Math.max(last.maxPrompt, row.prompt) });
    } else runs.push({ t: row.t, end: row.t, route: row.route, tools: row.tools, n: 1, hits: hit ? 1 : 0, misses: miss ? 1 : 0, prompt: row.prompt, cached: row.cached, maxPrompt: row.prompt });
  }
  console.log(`\n=== ${file}\nrequests=${rows.length}  overall=${((100 * rows.reduce((a, r) => a + r.cached, 0)) / rows.reduce((a, r) => a + r.prompt, 0)).toFixed(1)}%`);
  console.log('  window                     route                          hdrTools   n   >80%   <5%   promptAvg  promptMax');
  for (const run of runs) {
    console.log(
      `  ${clock(run.t)}-${clock(run.end)}  ${run.route.padEnd(30)} ${String(run.tools).padStart(3)}  ${String(run.n).padStart(3)}  ${String(run.hits).padStart(4)}  ${String(run.misses).padStart(4)}  ${String(Math.round(run.prompt / run.n)).padStart(8)}  ${String(run.maxPrompt).padStart(8)}`
    );
  }
  const byTurn = new Map();
  for (const row of rows) {
    const turn = byTurn.get(row.turn) ?? { step1: [], later: [] };
    (row.step === 1 ? turn.step1 : turn.later).push(row.cached / row.prompt);
    byTurn.set(row.turn, turn);
  }
  console.log('  turn   step1-rate   later-avg   n(later)');
  for (const [turn, value] of byTurn) {
    const avg = (list) => (list.length ? (100 * list.reduce((a, b) => a + b, 0)) / list.length : NaN);
    console.log(`  ${String(turn).padStart(4)}   ${(avg(value.step1) || 0).toFixed(1).padStart(9)}%   ${(Number.isNaN(avg(value.later)) ? 0 : avg(value.later)).toFixed(1).padStart(8)}%   ${String(value.later.length).padStart(6)}`);
  }
}
