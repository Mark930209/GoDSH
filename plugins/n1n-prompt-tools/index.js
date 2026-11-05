/**
 * Host half of the n1n-prompt-tools bundle.
 *
 * n1n gateway only (the `providers` list defaults to `['n1n']`).
 *
 * Fixes the prefix-cache loss caused by a provider receiving the native `tools`
 * field, by moving the whole tool catalog into the (already cached) system
 * prompt and removing `tools` from the request body:
 *
 *   1. `system-prompt/assemble` — append a deterministic, name-sorted tool
 *      catalog section (name, description, JSON Schema) with the calling
 *      protocol, then clear `assembly.tools` so the adapter sends no `tools`.
 *
 *   2. `llm/stream` — the model answers with a tool call in its text stream.
 *      Two syntaxes are accepted, because models drift between them:
 *        a. `@@TOOL@@ {"name":..,"arguments":{..}}` (the documented protocol)
 *        b. an XML-ish invoke block, e.g.
 *           `<｜DSML｜ calls><｜DSML｜ invoke name="read"><｜DSML｜ parameter
 *            name="path" string="true">a.txt</｜DSML｜ parameter></｜DSML｜ invoke>`
 *      Text is reassembled across arbitrary chunk splits (marker or JSON object
 *      split between chunks, braces/escapes inside strings, optional code
 *      fences) and re-emitted as harness `tool-call` blocks, so the rest of the
 *      loop — execution, result回填, UI — is unchanged.
 *
 * Both halves are gated on the exact n1n route. There is no "enable for every
 * provider" switch: a provider that caches the `tools` field correctly, or a
 * model that ignores the text protocol, must keep native tool calling.
 */
import { randomUUID } from 'node:crypto';

export const name = 'n1n-prompt-tools';

/** Section appended to the assembled system prompt. */
const CATALOG_SECTION = 'plugin:n1n-prompt-tools:catalog';

/** Index base for tool-call blocks so they never collide with adapter text blocks. */
const TOOL_BLOCK_INDEX_BASE = 1_000_000;

/** Matches an opening/closing code fence token at the end of a buffer. */
const TRAILING_FENCE = /(```[A-Za-z0-9_+-]*[ \t]*\n?|`{1,2})$/;

/** XML-form framing tags. Group 1 is the tag prefix (`｜DSML｜`, `|tool▁`, …). */
const CALLS_OPEN = /^<([^<>\s]+)\s+calls\s*>/;
const CALLS_CLOSE = /^<\/([^<>\s]+)\s+calls\s*>/;
const INVOKE_OPEN = /^<([^<>\s]+)\s+invoke\s+name\s*=\s*"([^"]*)"\s*>/;

/**
 * The `<tool_call>` dialect used by the qwen/mimo family. Two bodies occur:
 *   `<tool_call>{"name":"read","arguments":{…}}</tool_call>`            (qwen3.8-max)
 *   `<tool_call><function=read><parameter=file_path>a</parameter>…`     (mimo, next-iq3)
 */
const TOOL_CALL_OPEN = /^<tool_call\s*>/;
const TOOL_CALL_CLOSE = '</tool_call>';
const FUNCTION_OPEN = /^<function\s*=\s*([^>\s]+)\s*>/;
const PARAMETER_OPEN = /^<parameter\s*=\s*([^>\s]+)\s*>/;
const PARAMETER_CLOSE = '</parameter>';
const FUNCTION_CLOSE = '</function>';

/** Anything that looks like an attempt to call a tool, used by auto-detection. */
const CALL_ATTEMPT = /(@@TOOL@@|<tool_call|<function\s*=|DSML)/;
/** Any single tag, used to find the earliest opener inside prose. */
const ANY_TAG = /<[^<>]{1,120}>/g;

/** The only provider this bundle may ever rewrite. */
export const N1N_PROVIDER = 'n1n';

/**
 * Resolve the effective options from the patch row's raw `config`.
 *
 * Fail-closed by design: the provider allow-list defaults to `['n1n']`, and an
 * empty list means **nothing is allowed** — there is deliberately no "empty
 * means every provider" escape hatch, because rewriting another provider's
 * request would silently break its native tool calling.
 *
 * A malformed row falls back to the documented defaults instead of preventing
 * the plugin from loading.
 */
export function resolveOptions(config) {
  const raw = config !== null && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const bool = (key, fallback) => (typeof raw[key] === 'boolean' ? raw[key] : fallback);
  const text = (key, fallback) => (typeof raw[key] === 'string' && raw[key].length > 0 ? raw[key] : fallback);
  const list = (key, fallback) => {
    if (!Array.isArray(raw[key])) return fallback;
    return raw[key].filter((value) => typeof value === 'string' && value.length > 0);
  };
  return {
    enabled: bool('enabled', true),
    // Anything other than n1n is dropped here, so a stale config row cannot
    // widen the plugin onto another vendor.
    providers: list('providers', [N1N_PROVIDER]).filter((value) => value === N1N_PROVIDER),
    // Optional allow-list inside n1n; empty means every n1n model.
    models: list('models', []),
    // Optional deny-list inside n1n; always wins over `models`.
    denyModels: list('denyModels', []),
    // When a model visibly fails the text protocol, fall back to native tools
    // for the rest of the process instead of showing raw markup.
    autoDetect: bool('autoDetect', true),
    // Never leave a tools-less reply unparsed: if some other layer removed the
    // tools, still convert its markup into real calls rather than dead text.
    parseStrippedRoutes: bool('parseStrippedRoutes', true),
    marker: text('marker', '@@TOOL@@')
  };
}

/**
 * Whether this exact provider/model pair may use the text protocol.
 *
 * Both halves fail closed: an unknown provider id (or a missing one) is never
 * allowed, so a route the harness cannot identify keeps native tool calling.
 */
export function routeAllowed(options, provider, model) {
  if (typeof provider !== 'string' || provider !== N1N_PROVIDER) return false;
  if (!options.providers.includes(provider)) return false;
  if (typeof model === 'string' && options.denyModels?.includes(model) === true) return false;
  if (options.models.length === 0) return true;
  return typeof model === 'string' && options.models.includes(model);
}

/** Recursively sort object keys so the rendered text is byte-identical every step. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

/**
 * Render the tool catalog plus the calling protocol into one deterministic
 * system-prompt section.
 *
 * Ordering is by name (the harness already sorts, but a plugin-owned sort keeps
 * the text stable if another listener hands us an unordered list). Deferred
 * tools are omitted because the adapter never exposed them natively either.
 */
export function renderToolCatalog(tools, options) {
  const marker = options?.marker ?? '@@TOOL@@';
  const byName = [...tools]
    .filter((tool) => tool !== null && typeof tool === 'object' && tool.deferLoading !== true)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const lines = [
    '# Tool use protocol',
    '',
    'Native tool calling is disabled for this request. The tools below are declared in this prompt instead.',
    'To call a tool, emit one line that starts with the marker below, followed by one JSON object:',
    '',
    `${marker} {"name":"<tool-name>","arguments":{...}}`,
    '',
    'Rules:',
    '- "name" must exactly match one of the tool names below.',
    '- "arguments" must be a JSON object that satisfies that tool\'s parameter schema.',
    `- Put each call on its own line. One JSON object per ${marker} line; several lines call several tools.`,
    '- Do not wrap the call in a code fence and do not put prose on the same line.',
    '- Do not use any other tool-call syntax: no XML tags, no <invoke> blocks, no function-call JSON.',
    '- After the call line(s), stop. The harness runs the call(s) and returns the results as tool messages.',
    `- If no tool is needed, answer normally and do not emit ${marker}.`,
    '',
    'Available tools (sorted by name; parameters are JSON Schema):'
  ];

  for (const tool of byName) {
    lines.push('');
    lines.push(`## ${tool.name}`);
    if (typeof tool.description === 'string' && tool.description.length > 0) lines.push(tool.description);
    lines.push(`Parameters: ${stableStringify(tool.parameters ?? {})}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Escape one string for literal use inside a RegExp. */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Accept a tag prefix only when it plausibly names a tool-call channel. */
function tagPrefixOk(prefix) {
  return /(?:DSML|tool)/i.test(prefix);
}

/** Count leading whitespace characters. */
function leadingWhitespaceLen(text) {
  let index = 0;
  while (index < text.length && /\s/.test(text[index])) index++;
  return index;
}

/** Length of the longest suffix of `buffer` that is a prefix of `marker`. */
function suffixPrefixLen(buffer, marker) {
  const max = Math.min(buffer.length, marker.length - 1);
  for (let length = max; length > 0; length--) {
    if (marker.startsWith(buffer.slice(buffer.length - length))) return length;
  }
  return 0;
}

/** Length of a trailing fence token that must be held so it can be stripped with a call. */
function trailingFenceLen(buffer) {
  const match = TRAILING_FENCE.exec(buffer);
  return match === null ? 0 : match[1].length;
}

/**
 * Bytes to withhold because they may still become an opener.
 *
 * Covers a partial marker, a partial code fence, and an unterminated `<tag` so a
 * tag split across chunks is never leaked as prose.
 */
function holdLen(buffer, marker) {
  let keep = Math.max(suffixPrefixLen(buffer, marker), trailingFenceLen(buffer));
  const lastOpen = buffer.lastIndexOf('<');
  if (lastOpen >= 0 && buffer.indexOf('>', lastOpen) < 0) keep = Math.max(keep, buffer.length - lastOpen);
  return keep;
}

/** Whether `text` begins with a tag this transform treats as tool-call framing. */
function startsWithToolTag(text) {
  if (TOOL_CALL_OPEN.test(text)) return true;
  for (const pattern of [CALLS_OPEN, CALLS_CLOSE, INVOKE_OPEN]) {
    const match = pattern.exec(text);
    if (match !== null && tagPrefixOk(match[1])) return true;
  }
  return false;
}

/** Whether a leading code fence is immediately followed by a tool call. */
function fenceWrapsCall(text) {
  if (!text.startsWith('```')) return false;
  const newline = text.indexOf('\n');
  if (newline < 0) return false;
  const after = text.slice(newline + 1).replace(/^\s+/, '');
  return after.startsWith('@@TOOL@@') || startsWithToolTag(after);
}

/**
 * Find the earliest position where a tool call may begin.
 *
 * Returns -1 when the text holds no opener.
 */
function earliestOpener(text, marker) {
  let best = text.indexOf(marker);
  ANY_TAG.lastIndex = 0;
  let match;
  while ((match = ANY_TAG.exec(text)) !== null) {
    if (best >= 0 && match.index >= best) break;
    if (startsWithToolTag(match[0])) {
      best = match.index;
      break;
    }
  }
  return best;
}

/**
 * Try to read one `@@TOOL@@`-style call from the start of `input`.
 *
 * Returns `{ state: 'need' }` while the object may still be incomplete,
 * `{ state: 'invalid' }` when the text cannot be a call, and on success
 * `{ state: 'ok', name, argsJson, consumed }`.
 */
export function extractToolCall(input) {
  let cursor = 0;
  while (cursor < input.length && /\s/.test(input[cursor])) cursor++;
  if (input.startsWith('```', cursor)) {
    const newline = input.indexOf('\n', cursor + 3);
    if (newline < 0) return { state: 'need' };
    cursor = newline + 1;
    while (cursor < input.length && /\s/.test(input[cursor])) cursor++;
  }
  if (cursor >= input.length) return { state: 'need' };
  if (input[cursor] !== '{') return { state: 'invalid' };

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = cursor; index < input.length; index++) {
    const character = input[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth++;
    else if (character === '}') {
      depth--;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  if (end < 0) return { state: 'need' };

  let parsed;
  try {
    parsed = JSON.parse(input.slice(cursor, end + 1));
  } catch {
    return { state: 'invalid' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { state: 'invalid' };
  if (typeof parsed.name !== 'string' || parsed.name.length === 0) return { state: 'invalid' };

  // Tolerate models that flatten the arguments next to `name` instead of nesting
  // them under "arguments" (both forms appear in practice on compatible gateways).
  const { name: _name, arguments: rawArguments, ...inline } = parsed;
  let argsJson;
  if (typeof rawArguments === 'string') argsJson = rawArguments;
  else {
    const nested = rawArguments !== null && typeof rawArguments === 'object' && !Array.isArray(rawArguments) ? rawArguments : {};
    argsJson = JSON.stringify({ ...inline, ...nested });
  }

  return { state: 'ok', name: parsed.name, argsJson, consumed: end + 1 };
}

/** Index where a `<parameter>` body must stop, tolerant of truncated closers. */
function parameterBoundary(text, escaped) {
  const candidates = [
    new RegExp(`</${escaped}\\s+parameter\\s*>`),
    new RegExp(`<${escaped}\\s+parameter\\b`),
    new RegExp(`</${escaped}\\s+invoke\\s*>`),
    new RegExp(`<${escaped}\\s+invoke\\b`),
    // Degraded closer: the model sometimes emits `PREFIX>` where the proper
    // `</PREFIX parameter>` belongs. The prefix itself never occurs in prose,
    // so this cannot truncate a legitimate value.
    new RegExp(`(?:^|[^<\\/])${escaped}\\s*>`)
  ];
  let best = -1;
  for (const pattern of candidates) {
    const match = pattern.exec(text);
    if (match === null) continue;
    const at = match[0].startsWith('</') || match[0].startsWith('<') ? match.index : match.index + 1;
    if (best < 0 || at < best) best = at;
  }
  return best;
}

/**
 * Try to read one XML-form invoke block from the start of `input`.
 *
 * Accepts the shape models emit when their native tool syntax leaks through:
 * `<PREFIX invoke name="X"> … <PREFIX parameter name="k" string="true">v</PREFIX parameter> … </PREFIX invoke>`.
 * A `calls` wrapper is stripped by the caller as framing.
 */
export function extractInvokeCall(input) {
  const open = INVOKE_OPEN.exec(input);
  if (open === null || !tagPrefixOk(open[1])) return { state: 'none' };
  const prefix = open[1];
  const escaped = escapeRegExp(prefix);
  const closePattern = new RegExp(`</${escaped}\\s+invoke\\s*>`);
  const rest = input.slice(open[0].length);
  const close = closePattern.exec(rest);
  if (close === null) return { state: 'need' };

  const name = open[2];
  if (name.length === 0) return { state: 'invalid' };

  const body = rest.slice(0, close.index);
  const args = {};
  const parameterOpen = new RegExp(`<${escaped}\\s+parameter\\s+([^>]*)>`);
  let rest2 = body;
  for (let guard = 0; guard < 200; guard++) {
    const opening = parameterOpen.exec(rest2);
    if (opening === null) break;
    const attributes = opening[1];
    const keyMatch = /name\s*=\s*"([^"]*)"/.exec(attributes);
    const raw = rest2.slice(opening.index + opening[0].length);
    const stop = parameterBoundary(raw, escaped);
    const value = stop < 0 ? raw : raw.slice(0, stop);
    rest2 = stop < 0 ? '' : raw.slice(stop);
    if (keyMatch === null) continue;
    const key = keyMatch[1];
    if (/string\s*=\s*"true"/.test(attributes)) args[key] = value;
    else {
      try {
        args[key] = JSON.parse(value.trim());
      } catch {
        args[key] = value.trim();
      }
    }
  }

  return {
    state: 'ok',
    name,
    argsJson: JSON.stringify(args),
    consumed: open[0].length + close.index + close[0].length
  };
}

/**
 * Normalise a parsed call envelope into its arguments.
 *
 * Tolerates models that flatten the arguments next to `name` instead of nesting
 * them under "arguments" (both forms appear in practice on compatible gateways).
 */
function describeArguments(parsed) {
  const { name: _name, arguments: rawArguments, ...inline } = parsed;
  if (typeof rawArguments === 'string') {
    try {
      return { ...inline, ...JSON.parse(rawArguments) };
    } catch {
      return inline;
    }
  }
  const nested = rawArguments !== null && typeof rawArguments === 'object' && !Array.isArray(rawArguments) ? rawArguments : {};
  return { ...inline, ...nested };
}

/**
 * Coerce one `<parameter=key>value</parameter>` body using the tool's declared
 * schema type.
 *
 * The tag dialect carries no types, so `limit` would otherwise arrive as the
 * string "75" and fail schema validation. Coercion is driven by the catalog the
 * outbound half already captured, so a parameter the schema calls `string` is
 * never turned into a number just because it looks numeric.
 */
function coerceParameter(raw, type) {
  const text = raw.trim();
  if (type === 'string') return text;
  if (type === 'integer' || type === 'number') {
    const numeric = Number(text);
    if (text.length > 0 && Number.isFinite(numeric)) return numeric;
    return text;
  }
  if (type === 'boolean') {
    if (text === 'true') return true;
    if (text === 'false') return false;
    return text;
  }
  if (type === 'object' || type === 'array') {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  // Unknown type: only adopt a value that is unambiguously JSON.
  if (text === 'true') return true;
  if (text === 'false') return false;
  return text;
}

/**
 * Try to read one `<tool_call>` block from the start of `input`.
 *
 * Handles both bodies the qwen/mimo family emits: a JSON envelope, and the
 * `<function=NAME><parameter=K>V</parameter></function>` tag form. `types`
 * optionally maps parameter names to schema types for coercion.
 */
export function extractToolCallBlock(input, types = undefined) {
  const open = TOOL_CALL_OPEN.exec(input);
  if (open === null) return { state: 'none' };
  const closeAt = input.indexOf(TOOL_CALL_CLOSE, open[0].length);
  if (closeAt < 0) return { state: 'need' };

  const body = input.slice(open[0].length, closeAt);
  const consumed = closeAt + TOOL_CALL_CLOSE.length;
  const trimmed = body.trim();
  if (trimmed.length === 0) return { state: 'invalid' };

  // Body form 1: a JSON envelope, same shape as the documented marker.
  if (trimmed.startsWith('{')) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { state: 'invalid' };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { state: 'invalid' };
    if (typeof parsed.name !== 'string' || parsed.name.length === 0) return { state: 'invalid' };
    return { state: 'ok', name: parsed.name, argsJson: JSON.stringify(describeArguments(parsed)), consumed };
  }

  // Body form 2: `<function=NAME>` plus repeated `<parameter=K>V</parameter>`.
  const functionOpen = FUNCTION_OPEN.exec(trimmed);
  if (functionOpen === null) return { state: 'invalid' };
  const name = functionOpen[1];
  const schema = types !== null && typeof types === 'object' ? types[name] : undefined;
  const args = {};
  let rest = trimmed.slice(functionOpen[0].length);
  for (let guard = 0; guard < 200; guard++) {
    rest = rest.replace(/^[\s,]+/, '');
    if (rest.length === 0 || rest.startsWith(FUNCTION_CLOSE)) break;
    const parameterOpen = PARAMETER_OPEN.exec(rest);
    if (parameterOpen === null) return { state: 'invalid' };
    const key = parameterOpen[1];
    rest = rest.slice(parameterOpen[0].length);
    const parameterClose = rest.indexOf(PARAMETER_CLOSE);
    if (parameterClose < 0) return { state: 'invalid' };
    const declared = schema !== null && typeof schema === 'object' ? schema[key] : undefined;
    args[key] = coerceParameter(rest.slice(0, parameterClose), declared);
    rest = rest.slice(parameterClose + PARAMETER_CLOSE.length);
  }

  return { state: 'ok', name, argsJson: JSON.stringify(args), consumed };
}

/**
 * Wrap an adapter chunk stream, turning text-form tool calls into harness
 * tool-call blocks.
 *
 * Text is streamed as it becomes unambiguous: only trailing bytes that could
 * still become an opener are held back. A call is emitted only once it is
 * complete, so a split object or tag is reassembled before execution.
 */
export async function* createInboundTransform(source, options = {}) {
  const marker = typeof options.marker === 'string' && options.marker.length > 0 ? options.marker : '@@TOOL@@';
  /** Parameter schema types per tool, used to type the tag dialect's arguments. */
  const argumentTypes = options.argumentTypes !== null && typeof options.argumentTypes === 'object' ? options.argumentTypes : {};
  /** Called once when the stream ends, so the caller can judge protocol support. */
  const onSettle = typeof options.onSettle === 'function' ? options.onSettle : null;

  /** Adapter index of the text block currently being rewritten. */
  let textIndex = null;
  /** Unprocessed text tail for that block. */
  let textBuffer = '';
  /** Text already emitted for that block; becomes the rewritten block-end body. */
  let emittedText = '';
  /** Every character shown to the user, for protocol auto-detection. */
  let visibleText = '';
  /** Whether the replacement text block-start has been emitted. */
  let textOpen = false;
  /** Set after a call, so one closing code fence is swallowed instead of shown. */
  let skipFence = false;
  let toolSequence = 0;

  const toolChunks = (name, argsJson) => {
    const id = `call_${randomUUID()}`;
    const index = TOOL_BLOCK_INDEX_BASE + toolSequence++;
    return [
      { type: 'block-start', index, blockType: 'tool-call' },
      { type: 'tool-call-delta', index, id, name, argumentsDelta: argsJson },
      { type: 'block-end', index, block: { type: 'tool-call', id, name, arguments: argsJson } }
    ];
  };

  function* emitText(text) {
    if (text.length === 0) return;
    // Never open a text block (or emit) for whitespace alone: it is either
    // framing between calls or a stray newline, and would show up in the chat.
    if (!textOpen && text.trim().length === 0) return;
    if (!textOpen) {
      textOpen = true;
      yield { type: 'block-start', index: textIndex, blockType: 'text' };
    }
    emittedText += text;
    if (visibleText.length < 65536) visibleText += text;
    yield { type: 'text-delta', index: textIndex, text };
  }

  function* closeText() {
    if (textOpen) {
      yield { type: 'block-end', index: textIndex, block: { type: 'text', text: emittedText } };
    }
    textOpen = false;
  }

  /** Emit prose, minus a code fence that was only there to wrap a call. */
  function* emitProse(prefix) {
    let text = prefix;
    const fence = TRAILING_FENCE.exec(text);
    if (fence !== null) text = text.slice(0, fence.index);
    if (text.trim().length > 0) yield* emitText(text);
  }

  function* drain(final) {
    for (;;) {
      // 1. Framing: whitespace, one post-call fence, and calls wrappers.
      const lead = leadingWhitespaceLen(textBuffer);
      const rest = textBuffer.slice(lead);

      if (rest.length === 0) {
        if (final) {
          const pending = textBuffer;
          textBuffer = '';
          if (pending.length > 0) yield* emitText(pending);
        }
        return;
      }

      if (skipFence) {
        if (rest.startsWith('```')) {
          const newline = rest.indexOf('\n');
          textBuffer = newline >= 0 && newline <= 16 ? rest.slice(newline + 1) : rest.slice(3);
          skipFence = false;
          continue;
        }
        // Keep the pending fence through any remaining call framing tags
        // (`</invoke>`, `</calls>`) that sit between the call and the fence,
        // then fall through so the framing handlers below can consume them.
        if (!(rest.startsWith(marker) || startsWithToolTag(rest))) skipFence = false;
      }

      if (fenceWrapsCall(rest)) {
        const newline = rest.indexOf('\n');
        textBuffer = rest.slice(newline + 1);
        continue;
      }

      let framing = CALLS_OPEN.exec(rest) ?? CALLS_CLOSE.exec(rest);
      if (framing !== null && tagPrefixOk(framing[1])) {
        textBuffer = rest.slice(framing[0].length);
        continue;
      }

      // 2. A documented `@@TOOL@@` JSON call.
      if (rest.startsWith(marker)) {
        const after = rest.slice(marker.length);
        const parsed = extractToolCall(after);
        if (parsed.state === 'ok') {
          textBuffer = after.slice(parsed.consumed);
          yield* toolChunks(parsed.name, parsed.argsJson);
          skipFence = true;
          continue;
        }
        if (parsed.state === 'need' && !final) return;
        // Invalid, or incomplete at end of stream: keep the marker literal.
        yield* emitText(marker);
        textBuffer = after;
        continue;
      }

      // 3. A `<tool_call>` block (qwen / mimo native dialect).
      const block = extractToolCallBlock(rest, argumentTypes);
      if (block.state === 'ok') {
        textBuffer = rest.slice(block.consumed);
        yield* toolChunks(block.name, block.argsJson);
        skipFence = true;
        continue;
      }
      if (block.state === 'need' && !final) return;
      if (block.state === 'invalid' && !final) {
        // A complete-looking block we cannot parse: only commit once the
        // closing tag has arrived, otherwise wait for more bytes.
        if (rest.indexOf(TOOL_CALL_CLOSE) < 0) return;
      }

      // 4. An XML-form invoke block.
      const invoke = extractInvokeCall(rest);
      if (invoke.state === 'ok') {
        textBuffer = rest.slice(invoke.consumed);
        yield* toolChunks(invoke.name, invoke.argsJson);
        skipFence = true;
        continue;
      }
      if (invoke.state === 'need' && !final) return;

      // 4. Prose. Emit up to the next opener, or as much as is unambiguous.
      const at = earliestOpener(textBuffer, marker);
      if (at > 0) {
        const prefix = textBuffer.slice(0, at);
        textBuffer = textBuffer.slice(at);
        yield* emitProse(prefix);
        continue;
      }
      if (at === 0) {
        // An opener we cannot consume: release one character so progress is guaranteed.
        const head = textBuffer.slice(0, 1);
        textBuffer = textBuffer.slice(1);
        yield* emitText(head);
        continue;
      }

      if (final) {
        const all = textBuffer;
        textBuffer = '';
        yield* emitText(all);
        return;
      }

      const keep = holdLen(textBuffer, marker);
      if (textBuffer.length > keep) {
        const safe = textBuffer.length - keep;
        const head = textBuffer.slice(0, safe);
        textBuffer = textBuffer.slice(safe);
        yield* emitText(head);
      }
      return;
    }
  }

  for await (const chunk of source) {
    switch (chunk.type) {
      case 'block-start': {
        if (chunk.blockType !== 'text') {
          yield chunk;
          break;
        }
        if (textIndex !== null) {
          yield* drain(true);
          yield* closeText();
        }
        textIndex = chunk.index;
        textBuffer = '';
        emittedText = '';
        textOpen = false;
        skipFence = false;
        break;
      }
      case 'text-delta': {
        if (textIndex === null) {
          textIndex = chunk.index;
          textBuffer = '';
          emittedText = '';
          textOpen = false;
        } else if (chunk.index !== textIndex) {
          yield* drain(true);
          yield* closeText();
          textIndex = chunk.index;
          textBuffer = '';
          emittedText = '';
        }
        textBuffer += chunk.text;
        yield* drain(false);
        break;
      }
      case 'block-end': {
        if (chunk.block?.type === 'text') {
          if (textIndex === null) textIndex = chunk.index;
          yield* drain(true);
          yield* closeText();
          textIndex = null;
          textBuffer = '';
          emittedText = '';
          skipFence = false;
        } else {
          yield chunk;
        }
        break;
      }
      default:
        yield chunk;
    }
  }

  if (textIndex !== null) {
    yield* drain(true);
    yield* closeText();
  }

  // Auto-detection: a reply that shows tool-call syntax but yielded no call
  // means this model cannot follow the text protocol.
  if (onSettle !== null) {
    onSettle({ toolCalls: toolSequence, suspicious: toolSequence === 0 && CALL_ATTEMPT.test(visibleText) });
  }
}

/** Install the outbound catalog rewrite and the inbound text-call parser. */
export function apply(ctx, config) {
  const options = resolveOptions(config);

  const note = (level, message) => {
    try {
      ctx.logger[level](`[n1n-prompt-tools] ${message}`);
    } catch {
      // Logging must never break a model request.
    }
  };

  if (!options.enabled) {
    note('info', 'disabled by config');
    return () => {};
  }

  return ctx.effect(() => {
    /**
     * Routes proven unusable with the text protocol in this process. Absence
     * means "not yet disproven", so the plugin starts optimistic and only ever
     * removes itself from a route it has watched fail.
     */
    const downgraded = new Map();
    /** Parameter schema types per route, captured at assemble time for coercion. */
    const catalogs = new Map();
    const routeKey = (provider, model) => `${provider ?? ''}::${model ?? ''}`;
    /** Whether this route must keep native tool calling. */
    const isNative = (provider, model) => downgraded.get(routeKey(provider, model)) === 'native';

    const disposeAssemble = ctx.on('system-prompt/assemble', async (assembly, context, next) => {
      const assembled = await next();
      if (assembled === null || typeof assembled !== 'object') return assembled;
      // `installModelSelection` publishes the selected route as prompt
      // variables; the agent options are only a fallback. An unidentified
      // route stays native.
      const provider = assembled.variables?.provider ?? context?.agent?.options?.provider;
      const model = assembled.variables?.model ?? context?.agent?.options?.model;
      if (!routeAllowed(options, provider, model)) return assembled;
      if (isNative(provider, model)) return assembled;
      const tools = Array.isArray(assembled.tools) ? assembled.tools : [];
      if (tools.length === 0) return assembled;

      let catalog;
      try {
        catalog = renderToolCatalog(tools, options);
      } catch (error) {
        note('warn', `could not render the tool catalog; keeping native tools: ${String(error)}`);
        return assembled;
      }

      // Remember the declared parameter types for this route so the inbound
      // half can type `<parameter=…>` values that arrive as bare text.
      const types = {};
      for (const tool of tools) {
        const properties = tool?.parameters?.properties;
        if (tool?.name === undefined || properties === null || typeof properties !== 'object') continue;
        types[tool.name] = Object.fromEntries(
          Object.entries(properties).map(([key, schema]) => [key, typeof schema?.type === 'string' ? schema.type : ''])
        );
      }
      catalogs.set(routeKey(provider, model), types);

      return {
        ...assembled,
        tools: [],
        sections: [...assembled.sections, { name: CATALOG_SECTION, text: catalog, interpolate: false }]
      };
    });

    const disposeStream = ctx.on('llm/stream', (request, next) => {
      // The request carries the frozen route, so this is the authoritative gate.
      const allowed = routeAllowed(options, request?.provider, request?.model);
      const toolsPresent = Array.isArray(request?.tools) && request.tools.length > 0;
      if (toolsPresent) return next();
      if (allowed && !isNative(request?.provider, request?.model)) {
        return createInboundTransform(next(), {
          marker: options.marker,
          argumentTypes: catalogs.get(routeKey(request?.provider, request?.model)),
          onSettle: ({ toolCalls, suspicious }) => {
            if (!options.autoDetect || !suspicious) return;
            downgraded.set(routeKey(request?.provider, request?.model), 'native');
            note(
              'warn',
              `${request?.model} showed tool-call syntax but produced ${toolCalls} call(s); ` +
                'falling back to native tools for this route'
            );
          }
        });
      }
      // Safety net: a request with no tools on a route we did not rewrite means
      // the outbound half judged differently from the frozen request. Parsing the
      // reply is strictly better than showing raw markup and ending the turn
      // without running anything, so the same transform is used as a fallback.
      if (request?.tools !== undefined && toolsPresent === false && options.parseStrippedRoutes) {
        note('warn', `no tools on ${String(request?.provider)}/${String(request?.model)}; parsing its reply defensively`);
        return createInboundTransform(next(), { marker: options.marker });
      }
      return next();
    });

    const scope = `${options.providers.join(', ') || 'none'}${options.models.length > 0 ? ` / models: ${options.models.join(', ')}` : ''}${options.denyModels.length > 0 ? ` / deny: ${options.denyModels.join(', ')}` : ''}`;
    note('info', `active for: ${scope}${options.autoDetect ? ' (auto-detect on)' : ''}`);

    return () => {
      disposeAssemble();
      disposeStream();
    };
  }, 'n1n-prompt-tools');
}
