// What the company actually needs to know: is there ANY measurable difference
// between the two request shapes, once the noise is accounted for?
//
// Earlier runs kept producing isolated 0% steps in both arms, which looks like
// gateway-side cache eviction rather than a property of the request. This
// measures the *distribution* over many trials instead of trusting single
// samples, and reports a paired comparison since the arms alternate.
import fs from 'node:fs';
import path from 'node:path';

const KEY = fs
  .readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, '.dsh', '.credentials.yaml'), 'utf8')
  .match(/N1N_API_KEY:\s*(\S+)/)[1];
const BASE = 'https://llm-api.net/v1';
const MODEL = process.argv[2] || 'deepseek-v4.1-flash';
const TRIALS = Number(process.argv[3] || 30);

const KINDS = ['read', 'write', 'search', 'list', 'patch', 'glob', 'grep', 'run'];
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}

// Mirror the real catalogue: 32 tools, 31967 chars.
const TOOLS = Array.from({ length: 32 }, (_, i) => ({
  type: 'function',
  function: {
    name: `tool_${String(i).padStart(2, '0')}_${KINDS[i % 8]}`,
    description:
      `Tool ${i} performs the ${KINDS[i % 8]} operation. Arguments are validated against the schema before use, ` +
      'paths resolve against the project root, and every invocation is recorded for replay. '.repeat(9),
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the workspace root.' },
        pattern: { type: 'string', description: 'Glob or regular expression to match.' },
        recursive: { type: 'boolean', description: 'Whether to descend into subdirectories.' },
        limit: { type: 'number', description: 'Maximum number of results to return.' }
      },
      required: ['path'],
      additionalProperties: false
    }
  }
}));

function renderCatalog(tools) {
  const lines = ['Available tools (sorted by name; parameters are JSON Schema):'];
  for (const t of [...tools.map((x) => x.function)].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    lines.push(`- ${t.name}: ${t.description}`);
    lines.push(`  Parameters: ${stable(t.parameters)}`);
  }
  return lines.join('\n');
}

const CATALOG = renderCatalog(TOOLS);
console.log(`catalogue ${CATALOG.length} chars (real DSH: 31967)`);

const SYSTEM = Array.from({ length: 60 }, (_, i) =>
  `## Section ${i}\nPrefer the smallest sufficient change. Quote paths verbatim. Verify before reporting done. ` +
  `Never invent file contents. Keep replies concise. Rule set ${i}.`
).join('\n\n');

const turn = (i) =>
  `Turn ${i}: inspected the layout, read the persistence module, confirmed the writer uses a checksum flag, ` +
  `and verified the frame walker rejects reserved bits. Continuing with the next step. `.repeat(3);

async function collect(res) {
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = null;
  for await (const part of res.body) {
    buffer += decoder.decode(part, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        if (j.usage) usage = j.usage;
      } catch {
        /* ignore */
      }
    }
  }
  return {
    prompt: usage?.prompt_tokens ?? 0,
    cached: usage?.prompt_tokens_details?.cached_tokens ?? 0
  };
}

async function post(body, attempt = 0) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    if ((res.status === 503 || res.status === 429) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 3000));
      return post(body, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  return collect(res);
}

// A fixed, growing conversation shared by both arms; only placement differs.
const DEPTH = 10;
const convo = [];
for (let i = 0; i < DEPTH; i += 1) {
  convo.push({ role: 'user', content: turn(i) });
  convo.push({ role: 'assistant', content: `Acknowledged turn ${i}.` });
}
convo.push({ role: 'user', content: 'Reply with exactly: ok' });

function bodyFor(arm) {
  const b = { model: MODEL, max_tokens: 4, temperature: 0, stream: true, stream_options: { include_usage: true } };
  if (arm === 'native') {
    b.messages = [{ role: 'system', content: SYSTEM }, ...convo];
    b.tools = TOOLS;
  } else {
    b.messages = [{ role: 'system', content: `${SYSTEM}\n\n${CATALOG}` }, ...convo];
  }
  return b;
}

// Warm both so the first call is not a cold write.
await post(bodyFor('native'));
await post(bodyFor('text'));

const rows = [];
for (let i = 0; i < TRIALS; i += 1) {
  for (const arm of ['native', 'text']) {
    const r = await post(bodyFor(arm));
    rows.push({ trial: i, arm, ...r, rate: r.prompt ? r.cached / r.prompt : 0 });
  }
  if ((i + 1) % 10 === 0) process.stdout.write(`  ...${i + 1}/${TRIALS}\n`);
}

const byArm = { native: rows.filter((r) => r.arm === 'native'), text: rows.filter((r) => r.arm === 'text') };
console.log('\n=== distribution of cache rate over trials ===');
for (const [arm, list] of Object.entries(byArm)) {
  const rates = list.map((r) => r.rate).sort((a, b) => a - b);
  const pct = (x) => Math.round(x * 100);
  const mean = rates.reduce((a, c) => a + c, 0) / rates.length;
  const hits = list.filter((r) => r.rate >= 0.5).length;
  const fp = list.reduce((a, c) => a + c.prompt, 0);
  const fc = list.reduce((a, c) => a + c.cached, 0);
  console.log(
    `  ${arm.padEnd(7)} n=${list.length}  mean=${pct(mean)}%  median=${pct(rates[Math.floor(rates.length / 2)])}%  ` +
      `min=${pct(rates[0])}%  max=${pct(rates.at(-1))}%  hit=${pct(hits / list.length)}%  pooled=${pct(fc / fp)}%`
  );
  const zeros = list.filter((r) => r.rate < 0.5).length;
  console.log(`          misses: ${zeros} / ${list.length}`);
}

// Paired: same trial index, did one arm miss while the other hit?
let nativeOnlyMiss = 0;
let textOnlyMiss = 0;
let bothMiss = 0;
let bothHit = 0;
for (let i = 0; i < TRIALS; i += 1) {
  const n = byArm.native[i];
  const t = byArm.text[i];
  const nm = n.rate < 0.5;
  const tm = t.rate < 0.5;
  if (nm && tm) bothMiss += 1;
  else if (nm) nativeOnlyMiss += 1;
  else if (tm) textOnlyMiss += 1;
  else bothHit += 1;
}
console.log('\n=== paired per trial ===');
console.log(`  both hit        : ${bothHit}`);
console.log(`  both missed     : ${bothMiss}`);
console.log(`  only native miss: ${nativeOnlyMiss}`);
console.log(`  only text miss  : ${textOnlyMiss}`);
console.log(
  `\n  => any systematic difference would show up as an imbalance between the last two lines ` +
    `(${nativeOnlyMiss} vs ${textOnlyMiss}).`
);
