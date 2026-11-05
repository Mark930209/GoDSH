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
 * Both halves are gated by `providers` (empty = every provider), because a
 * provider that caches the `tools` field correctly is better off with the
 * native protocol.
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
/** Any single tag, used to find the earliest opener inside prose. */
const ANY_TAG = /<[^<>]{1,120}>/g;

/**
 * Resolve the effective options from the patch row's raw `config`.
 *
 * Validation is intentionally local and total: a malformed row falls back to
 * the documented defaults instead of preventing the plugin from loading.
 */
function resolveOptions(config) {
  const raw = config !== null && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const bool = (key, fallback) => (typeof raw[key] === 'boolean' ? raw[key] : fallback);
  const text = (key, fallback) => (typeof raw[key] === 'string' && raw[key].length > 0 ? raw[key] : fallback);
  const providers = Array.isArray(raw.providers)
    ? raw.providers.filter((value) => typeof value === 'string' && value.length > 0)
    : [];
  return {
    enabled: bool('enabled', true),
    providers,
    marker: text('marker', '@@TOOL@@')
  };
}

/** Whether one resolved provider id may use the text protocol. */
function providerAllowed(options, provider) {
  if (options.providers.length === 0) return true;
  return typeof provider === 'string' && options.providers.includes(provider);
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
  const parameter = new RegExp(
    `<${escaped}\\s+parameter\\s+([^>]*)>([\\s\\S]*?)</${escaped}\\s+parameter\\s*>`,
    'g'
  );
  let match;
  while ((match = parameter.exec(body)) !== null) {
    const attributes = match[1];
    const keyMatch = /name\s*=\s*"([^"]*)"/.exec(attributes);
    if (keyMatch === null) continue;
    const key = keyMatch[1];
    const raw = match[2];
    if (/string\s*=\s*"true"/.test(attributes)) args[key] = raw;
    else {
      try {
        args[key] = JSON.parse(raw);
      } catch {
        args[key] = raw;
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
 * Wrap an adapter chunk stream, turning text-form tool calls into harness
 * tool-call blocks.
 *
 * Text is streamed as it becomes unambiguous: only trailing bytes that could
 * still become an opener are held back. A call is emitted only once it is
 * complete, so a split object or tag is reassembled before execution.
 */
export async function* createInboundTransform(source, options = {}) {
  const marker = typeof options.marker === 'string' && options.marker.length > 0 ? options.marker : '@@TOOL@@';

  /** Adapter index of the text block currently being rewritten. */
  let textIndex = null;
  /** Unprocessed text tail for that block. */
  let textBuffer = '';
  /** Text already emitted for that block; becomes the rewritten block-end body. */
  let emittedText = '';
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

      // 3. An XML-form invoke block.
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
    const disposeAssemble = ctx.on('system-prompt/assemble', async (assembly, context, next) => {
      const assembled = await next();
      if (assembled === null || typeof assembled !== 'object') return assembled;
      const provider = assembled.variables?.provider ?? context?.agent?.options?.provider ?? '';
      if (!providerAllowed(options, provider)) return assembled;
      const tools = Array.isArray(assembled.tools) ? assembled.tools : [];
      if (tools.length === 0) return assembled;

      let catalog;
      try {
        catalog = renderToolCatalog(tools, options);
      } catch (error) {
        note('warn', `could not render the tool catalog; keeping native tools: ${String(error)}`);
        return assembled;
      }
      return {
        ...assembled,
        tools: [],
        sections: [...assembled.sections, { name: CATALOG_SECTION, text: catalog, interpolate: false }]
      };
    });

    const disposeStream = ctx.on('llm/stream', (request, next) => {
      if (!providerAllowed(options, request?.provider ?? '')) return next();
      if (Array.isArray(request?.tools) && request.tools.length > 0) return next();
      return createInboundTransform(next(), { marker: options.marker });
    });

    note('info', `active for providers: ${options.providers.length === 0 ? 'all' : options.providers.join(', ')}`);

    return () => {
      disposeAssemble();
      disposeStream();
    };
  }, 'n1n-prompt-tools');
}
