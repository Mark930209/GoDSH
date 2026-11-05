/**
 * Host half of the prompt-tools bundle.
 *
 * Fixes the prefix-cache loss caused by a provider receiving the native `tools`
 * field, by moving the whole tool catalog into the (already cached) system
 * prompt and removing `tools` from the request body:
 *
 *   1. `system-prompt/assemble` — append a deterministic, name-sorted tool
 *      catalog section (name, description, JSON Schema) with the calling
 *      protocol, then clear `assembly.tools` so the adapter sends no `tools`.
 *
 *   2. `llm/stream` — the model answers with `@@TOOL@@ {"name":..,"arguments":..}`
 *      lines in the normal text stream. This layer reassembles that text across
 *      arbitrary chunk splits (including a marker or JSON object split between
 *      chunks, braces/escapes inside strings, and optional code fences) and
 *      re-emits harness `tool-call` blocks so the rest of the loop is unchanged.
 *
 * Both halves are gated by `providers` (empty = every provider), because a
 * provider that caches the `tools` field correctly is better off with the
 * native protocol.
 */
import { randomUUID } from 'node:crypto';

export const name = 'prompt-tools';

/** Section appended to the assembled system prompt. */
const CATALOG_SECTION = 'plugin:prompt-tools:catalog';

/** Index base for tool-call blocks so they never collide with adapter text blocks. */
const TOOL_BLOCK_INDEX_BASE = 1_000_000;

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
    `- "name" must exactly match one of the tool names below.`,
    '- "arguments" must be a JSON object that satisfies that tool\'s parameter schema.',
    `- Put each call on its own line. One JSON object per ${marker} line; several lines call several tools.`,
    '- Do not wrap the call in a code fence and do not put prose on the same line.',
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

/** Length of the longest suffix of `buffer` that is a prefix of `marker`. */
function suffixPrefixLen(buffer, marker) {
  const max = Math.min(buffer.length, marker.length - 1);
  for (let length = max; length > 0; length--) {
    if (marker.startsWith(buffer.slice(buffer.length - length))) return length;
  }
  return 0;
}

/** Matches an opening/closing code fence token at the end of a buffer. */
const TRAILING_FENCE = /(```[A-Za-z0-9_+-]*[ \t]*\n?|`{1,2})$/;

/** Length of a trailing fence token that must be held so it can be stripped with a call. */
function trailingFenceLen(buffer) {
  const match = TRAILING_FENCE.exec(buffer);
  return match === null ? 0 : match[1].length;
}

/**
 * Try to read one tool-call object from the start of `input` (which begins just
 * after a marker).
 *
 * Returns `{ state: 'need' }` while the object may still be incomplete,
 * `{ state: 'invalid' }` when the text cannot be a call, and on success
 * `{ state: 'ok', name, argsJson, consumed }`.
 */
export function extractToolCall(input) {
  let cursor = 0;
  while (cursor < input.length && /\s/.test(input[cursor])) cursor++;
  let hadFence = false;
  if (input.startsWith('```', cursor)) {
    hadFence = true;
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

  return { state: 'ok', name: parsed.name, argsJson, consumed: end + 1, hadFence };
}

/**
 * Wrap an adapter chunk stream, turning `@@TOOL@@` text into harness tool-call
 * blocks.
 *
 * Text is streamed as it becomes unambiguous: only the trailing bytes that
 * could still become part of the marker are held back. A tool call is emitted
 * only once its JSON object is complete, so a split JSON object is reassembled
 * before execution.
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
  /** Set after a call when a closing code fence may still arrive. */
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

  function* drain(final) {
    for (;;) {
      if (skipFence) {
        let cursor = 0;
        while (cursor < textBuffer.length && /\s/.test(textBuffer[cursor])) cursor++;
        const rest = textBuffer.slice(cursor);
        if (rest.startsWith('```')) {
          const newline = rest.indexOf('\n');
          if (newline < 0) {
            if (!final) return;
            textBuffer = rest.slice(3);
            skipFence = false;
            continue;
          }
          textBuffer = rest.slice(newline + 1);
          skipFence = false;
          continue;
        }
        if (rest.length === 0) {
          if (!final) return;
          textBuffer = '';
          skipFence = false;
          return;
        }
        if (rest.startsWith(marker)) {
          // Whitespace between two calls is framing, not assistant prose.
          textBuffer = rest;
          skipFence = false;
          continue;
        }
        skipFence = false;
      }

      const position = textBuffer.indexOf(marker);
      if (position >= 0) {
        if (position > 0) {
          let prefix = textBuffer.slice(0, position);
          const fence = TRAILING_FENCE.exec(prefix);
          if (fence !== null) prefix = prefix.slice(0, fence.index);
          if (prefix.trim().length > 0) yield* emitText(prefix);
          textBuffer = textBuffer.slice(position);
        }
        const after = textBuffer.slice(marker.length);
        const parsed = extractToolCall(after);
        if (parsed.state === 'ok') {
          textBuffer = after.slice(parsed.consumed);
          yield* toolChunks(parsed.name, parsed.argsJson);
          skipFence = true;
          continue;
        }
        if (parsed.state === 'need' && !final) return;
        // Invalid, or an incomplete call at end of stream: keep the marker literal.
        yield* emitText(marker);
        textBuffer = after;
        continue;
      }

      if (final) {
        if (textBuffer.length > 0) {
          yield* emitText(textBuffer);
          textBuffer = '';
        }
        return;
      }

      const keep = Math.max(suffixPrefixLen(textBuffer, marker), trailingFenceLen(textBuffer));
      if (textBuffer.length > keep) {
        const safe = textBuffer.length - keep;
        yield* emitText(textBuffer.slice(0, safe));
        textBuffer = textBuffer.slice(safe);
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
      ctx.logger[level](`[prompt-tools] ${message}`);
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
      return createInboundTransform(next(), { marker: options.marker, note });
    });

    note('info', `active for providers: ${options.providers.length === 0 ? 'all' : options.providers.join(', ')}`);

    return () => {
      disposeAssemble();
      disposeStream();
    };
  }, 'prompt-tools');
}
