import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToolCatalog, stableStringify, extractToolCall, extractInvokeCall, createInboundTransform, resolveOptions, routeAllowed, apply } from '../index.js';

const TOOLS = [
  {
    name: 'bash',
    description: 'Run a shell command.',
    parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] }
  },
  {
    name: 'read',
    description: 'Read a file.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  },
  {
    name: 'deferred_tool',
    description: 'Should be omitted.',
    deferLoading: true,
    parameters: { type: 'object' }
  }
];

function blockStart(index, blockType) {
  return { type: 'block-start', index, blockType };
}

async function runTransform(chunks, options = {}) {
  const source = (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
  const out = [];
  for await (const chunk of createInboundTransform(source, options)) out.push(chunk);
  const text = out
    .filter((chunk) => chunk.type === 'text-delta')
    .map((chunk) => chunk.text)
    .join('');
  const blocks = out.filter((chunk) => chunk.type === 'block-end').map((chunk) => chunk.block);
  const toolBlocks = blocks.filter((block) => block.type === 'tool-call');
  return { out, text, blocks, toolBlocks };
}

test('stableStringify sorts keys recursively', () => {
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
});

test('renderToolCatalog is deterministic, name-sorted and skips deferred tools', () => {
  const first = renderToolCatalog(TOOLS, { marker: '@@TOOL@@' });
  const second = renderToolCatalog([...TOOLS].reverse(), { marker: '@@TOOL@@' });
  assert.equal(first, second, 'order of the input must not change the text');
  assert.ok(first.includes('@@TOOL@@'));
  assert.ok(first.indexOf('## bash') < first.indexOf('## read'));
  assert.ok(!first.includes('deferred_tool'));
  assert.ok(first.includes('Parameters: {"properties":{"cmd":{"type":"string"}},"required":["cmd"],"type":"object"}'));
});

test('extractToolCall reassembles a schema with braces inside a string', () => {
  const parsed = extractToolCall(' {"name":"read","arguments":{"path":"a}b{c.txt"}}rest');
  assert.equal(parsed.state, 'ok');
  assert.equal(parsed.name, 'read');
  assert.equal(parsed.argsJson, '{"path":"a}b{c.txt"}');
  assert.equal(parsed.consumed, ' {"name":"read","arguments":{"path":"a}b{c.txt"}}'.length);
});

test('extractToolCall reports need for an incomplete object', () => {
  assert.equal(extractToolCall(' {"name":"read","arguments":{"path":"a').state, 'need');
});

test('extractToolCall tolerates flattened arguments next to name', () => {
  const parsed = extractToolCall('{"name":"read","file_path":"a.txt"}');
  assert.equal(parsed.state, 'ok');
  assert.equal(parsed.name, 'read');
  assert.deepEqual(JSON.parse(parsed.argsJson), { file_path: 'a.txt' });
});

test('extractToolCall merges inline extras with nested arguments', () => {
  const parsed = extractToolCall('{"name":"read","file_path":"a.txt","arguments":{"offset":2}}');
  assert.deepEqual(JSON.parse(parsed.argsJson), { file_path: 'a.txt', offset: 2 });
});

test('whitespace before a call is not emitted as visible text', async () => {
  const { text, toolBlocks } = await runTransform([
    blockStart(0, 'text'),
    { type: 'text-delta', index: 0, text: '\n\n@@TOOL@@ {"name":"read","file_path":"a.txt"}' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } }
  ]);
  assert.equal(toolBlocks.length, 1);
  assert.deepEqual(JSON.parse(toolBlocks[0].arguments), { file_path: 'a.txt' });
  assert.equal(text, '');
});

test('plain text passes through unchanged', async () => {
  const { text, toolBlocks, blocks } = await runTransform([
    blockStart(0, 'text'),
    { type: 'text-delta', index: 0, text: 'Just an answer' },
    { type: 'text-delta', index: 0, text: ' with no calls.' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'ignored raw body' } }
  ]);
  assert.equal(text, 'Just an answer with no calls.');
  assert.equal(toolBlocks.length, 0);
  assert.equal(blocks[0].text, 'Just an answer with no calls.');
});

test('marker and JSON split across many chunks are reassembled', async () => {
  const { text, toolBlocks, blocks } = await runTransform([
    blockStart(0, 'text'),
    { type: 'text-delta', index: 0, text: 'Hello @@T' },
    { type: 'text-delta', index: 0, text: 'OOL@' },
    { type: 'text-delta', index: 0, text: '@ {"name":"read","argum' },
    { type: 'text-delta', index: 0, text: 'ents":{"path":"a.txt"}} bye' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } }
  ]);
  assert.equal(toolBlocks.length, 1);
  assert.equal(toolBlocks[0].name, 'read');
  assert.equal(toolBlocks[0].arguments, '{"path":"a.txt"}');
  assert.equal(text, 'Hello  bye');
  assert.equal(blocks.find((block) => block.type === 'text').text, 'Hello  bye');
});

test('escaped quotes and newlines inside arguments survive', async () => {
  const { toolBlocks } = await runTransform([
    blockStart(0, 'text'),
    { type: 'text-delta', index: 0, text: '@@TOOL@@ {"name":"bash","arguments":{"cmd":"echo \\"hi\\"\\nls"}}' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } }
  ]);
  assert.equal(toolBlocks.length, 1);
  assert.deepEqual(JSON.parse(toolBlocks[0].arguments), { cmd: 'echo "hi"\nls' });
});

test('a code-fenced call leaves no fence text behind', async () => {
  const { text, toolBlocks } = await runTransform([
    blockStart(0, 'text'),
    { type: 'text-delta', index: 0, text: 'Sure:\n```json\n' },
    { type: 'text-delta', index: 0, text: '@@TOOL@@ {"name":"read","arguments":{"path":"a.txt"}}\n' },
    { type: 'text-delta', index: 0, text: '```' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } }
  ]);
  assert.equal(toolBlocks.length, 1);
  assert.equal(text, 'Sure:\n');
});

test('two calls on separate lines both parse', async () => {
  const { toolBlocks, text } = await runTransform([
    blockStart(0, 'text'),
    { type: 'text-delta', index: 0, text: '@@TOOL@@ {"name":"read","arguments":{"path":"a"}}\n@@TOOL@@ {"name":"bash","arguments":{"cmd":"ls"}}' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } }
  ]);
  assert.deepEqual(toolBlocks.map((block) => block.name), ['read', 'bash']);
  assert.equal(text, '');
});

test('reasoning passes through and an empty text block is dropped', async () => {
  const { out, toolBlocks, blocks } = await runTransform([
    blockStart(0, 'reasoning'),
    { type: 'reasoning-delta', index: 0, text: 'thinking' },
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'thinking' } },
    blockStart(1, 'text'),
    { type: 'text-delta', index: 1, text: '@@TOOL@@ {"name":"read","arguments":{"path":"a"}}' },
    { type: 'block-end', index: 1, block: { type: 'text', text: 'raw' } },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
    { type: 'finish', reason: { kind: 'stop' } }
  ]);
  assert.equal(toolBlocks.length, 1);
  assert.ok(out.some((chunk) => chunk.type === 'reasoning-delta'));
  assert.ok(out.some((chunk) => chunk.type === 'usage'));
  assert.ok(out.some((chunk) => chunk.type === 'finish'));
  assert.ok(!blocks.some((block) => block.type === 'text'), 'no empty text block should be emitted');
  assert.equal(blocks.filter((block) => block.type === 'reasoning').length, 1);
});

test('an incomplete call at end of stream is kept as literal text', async () => {
  const { text, toolBlocks } = await runTransform([
    blockStart(0, 'text'),
    { type: 'text-delta', index: 0, text: '@@TOOL@@ {"name":"read","argum' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } }
  ]);
  assert.equal(toolBlocks.length, 0);
  assert.equal(text, '@@TOOL@@ {"name":"read","argum');
});

test('custom marker is honoured', async () => {
  const { toolBlocks } = await runTransform(
    [
      blockStart(0, 'text'),
      { type: 'text-delta', index: 0, text: '<<CALL>> {"name":"read","arguments":{"path":"a"}}' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } }
    ],
    { marker: '<<CALL>>' }
  );
  assert.equal(toolBlocks.length, 1);
  assert.equal(toolBlocks[0].name, 'read');
});

// --- XML-form invoke blocks: what the model emits when its native tool syntax
// --- leaks into a text-only protocol. These must not leak as visible text.

const XML_CALL = [
  '<｜DSML｜ calls>',
  '<｜DSML｜ invoke name="plugin_manager">',
  '<｜DSML｜ parameter name="action" string="true">list_plugins</｜DSML｜ parameter>',
  '<｜DSML｜ parameter name="offset" string="false">25</｜DSML｜ parameter>',
  '</｜DSML｜ invoke>',
  '</｜DSML｜ calls>'
].join('\n');

test('extractInvokeCall parses an invoke block with typed parameters', () => {
  const parsed = extractInvokeCall(
    '<｜DSML｜ invoke name="pwsh"><｜DSML｜ parameter name="command" string="true">ls</｜DSML｜ parameter><｜DSML｜ parameter name="timeout" string="false">5</｜DSML｜ parameter></｜DSML｜ invoke>'
  );
  assert.equal(parsed.state, 'ok');
  assert.equal(parsed.name, 'pwsh');
  assert.deepEqual(JSON.parse(parsed.argsJson), { command: 'ls', timeout: 5 });
});

test('an XML invoke block becomes one tool call and leaves no framing text', async () => {
  const { text, toolBlocks, blocks } = await runTransform([
    blockStart(0, 'text'),
    { type: 'text-delta', index: 0, text: '\n\n' + XML_CALL },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } }
  ]);
  assert.equal(toolBlocks.length, 1);
  assert.equal(toolBlocks[0].name, 'plugin_manager');
  assert.deepEqual(JSON.parse(toolBlocks[0].arguments), { action: 'list_plugins', offset: 25 });
  assert.equal(text, '');
  assert.ok(!blocks.some((block) => block.type === 'text' && block.text.includes('invoke')), 'no tag text may leak');
});

test('XML invoke split across many chunks is reassembled', async () => {
  const parts = [XML_CALL.slice(0, 9), XML_CALL.slice(9, 40), XML_CALL.slice(40, 61), XML_CALL.slice(61)];
  const chunks = [blockStart(0, 'text')];
  for (const part of parts) chunks.push({ type: 'text-delta', index: 0, text: part });
  chunks.push({ type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } });
  const { text, toolBlocks } = await runTransform(chunks);
  assert.equal(toolBlocks.length, 1);
  assert.equal(toolBlocks[0].name, 'plugin_manager');
  assert.equal(text, '');
});

test('an unclosed invoke block at end of stream is released as text', async () => {
  const { text, toolBlocks } = await runTransform([
    blockStart(0, 'text'),
    { type: 'text-delta', index: 0, text: '<｜DSML｜ invoke name="read">\n<｜DSML｜ parameter name="path" string="true">a.txt' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } }
  ]);
  assert.equal(toolBlocks.length, 0);
  assert.ok(text.includes('invoke'), 'unparseable text must not be swallowed');
});

test('prose before and after an XML invoke block survives', async () => {
  const { text, toolBlocks } = await runTransform([
    blockStart(0, 'text'),
    { type: 'text-delta', index: 0, text: 'Let me check.\n' + XML_CALL + '\nDone.' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } }
  ]);
  assert.equal(toolBlocks.length, 1);
  assert.equal(text, 'Let me check.\n\nDone.');
});

test('a code fence wrapping an XML invoke block is stripped', async () => {
  const { text, toolBlocks } = await runTransform([
    blockStart(0, 'text'),
    { type: 'text-delta', index: 0, text: '```xml\n' + XML_CALL + '\n```' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } }
  ]);
  assert.equal(toolBlocks.length, 1);
  assert.equal(text, '');
});

test('two XML invoke blocks in one message both parse', async () => {
  const { toolBlocks, text } = await runTransform([
    blockStart(0, 'text'),
    { type: 'text-delta', index: 0, text: XML_CALL + '\n' + XML_CALL },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'raw' } }
  ]);
  assert.equal(toolBlocks.length, 2);
  assert.equal(text, '');
});

// --- The provider gate: this bundle must never touch a non-n1n route.

test('the default config allows only n1n', () => {
  const options = resolveOptions({});
  assert.deepEqual(options.providers, ['n1n']);
  assert.equal(routeAllowed(options, 'n1n', 'deepseek-v4.1-flash'), true);
  for (const provider of ['strata', 'deepseek', 'openai', 'N1N', '', undefined, null]) {
    assert.equal(routeAllowed(options, provider, 'deepseek-v4.1-flash'), false, `provider ${String(provider)} must be refused`);
  }
});

test('an empty providers list disables the plugin instead of allowing everything', () => {
  const options = resolveOptions({ providers: [] });
  assert.deepEqual(options.providers, []);
  assert.equal(routeAllowed(options, 'n1n', 'deepseek-v4.1-flash'), false);
  assert.equal(routeAllowed(options, 'strata', 'qwen3.8-flash-next-iq3_s'), false);
});

test('a stale config cannot widen the plugin onto another vendor', () => {
  const options = resolveOptions({ providers: ['n1n', 'strata', 'deepseek'] });
  assert.deepEqual(options.providers, ['n1n'], 'only n1n may survive config resolution');
  assert.equal(routeAllowed(options, 'strata', 'qwen3.8-flash-next-iq3_s'), false);
  assert.equal(routeAllowed(options, 'deepseek', 'deepseek-chat'), false);
});

test('a models list narrows inside n1n and refuses other n1n models', () => {
  const options = resolveOptions({ models: ['deepseek-v4.1-flash'] });
  assert.equal(routeAllowed(options, 'n1n', 'deepseek-v4.1-flash'), true);
  assert.equal(routeAllowed(options, 'n1n', 'glm-5.3'), false);
  assert.equal(routeAllowed(options, 'strata', 'deepseek-v4.1-flash'), false);
});

test('an unidentified route keeps native tool calling', () => {
  const options = resolveOptions({});
  assert.equal(routeAllowed(options, undefined, undefined), false);
  assert.equal(routeAllowed(options, 'n1n', undefined), true, 'n1n with no model narrowing still applies');
});

// --- End-to-end gate: run apply() against a fake context and assert that a
// --- non-n1n route is passed through completely untouched.

function fakeCtx() {
  const handlers = new Map();
  const notes = [];
  return {
    handlers,
    notes,
    logger: {
      info: (line) => notes.push(['info', line]),
      warn: (line) => notes.push(['warn', line]),
      error: (line) => notes.push(['error', line])
    },
    on(event, handler) {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
    effect(fn) {
      return fn();
    }
  };
}

function assemblyFor(provider, model) {
  return {
    sections: [{ name: 'base', text: 'you are a helpful agent', interpolate: false }],
    tools: TOOLS.filter((tool) => tool.deferLoading !== true),
    contexts: [],
    variables: { provider, model }
  };
}

test('assemble rewrites the n1n route and leaves other providers untouched', async () => {
  const ctx = fakeCtx();
  apply(ctx, { providers: ['n1n'] });
  const assemble = ctx.handlers.get('system-prompt/assemble');
  assert.ok(assemble, 'the assemble hook must be registered');

  const n1n = assemblyFor('n1n', 'deepseek-v4.1-flash');
  const rewritten = await assemble(n1n, {}, async () => n1n);
  assert.deepEqual(rewritten.tools, [], 'n1n tools must be removed from the request');
  assert.equal(rewritten.sections.length, 2);
  assert.ok(rewritten.sections[1].text.includes('## read'));

  for (const provider of ['strata', 'deepseek', 'N1N', '', undefined]) {
    const other = assemblyFor(provider, 'some-model');
    const kept = await assemble(other, {}, async () => other);
    assert.equal(kept, other, `provider ${String(provider)} must be returned untouched`);
    assert.equal(kept.tools.length, 2, `provider ${String(provider)} must keep native tools`);
  }
});

test('the stream hook only wraps a text-protocol (tools-less) n1n request', () => {
  const ctx = fakeCtx();
  apply(ctx, { providers: ['n1n'] });
  const stream = ctx.handlers.get('llm/stream');
  assert.ok(stream, 'the stream hook must be registered');

  const passthrough = { marker: 'passthrough' };
  const next = () => passthrough;

  // An n1n request that still carries native tools is left alone.
  assert.equal(stream({ provider: 'n1n', model: 'deepseek-v4.1-flash', tools: [{ name: 'read' }] }, next), passthrough);
  for (const provider of ['strata', 'deepseek', '', undefined]) {
    assert.equal(stream({ provider, model: 'm', tools: [] }, next), passthrough, `provider ${String(provider)} must not be wrapped`);
  }
  // The n1n text-protocol request is wrapped into a transform iterable.
  const wrapped = stream({ provider: 'n1n', model: 'deepseek-v4.1-flash', tools: [] }, next);
  assert.notEqual(wrapped, passthrough);
});

test('a models list narrows the gate end to end', async () => {
  const ctx = fakeCtx();
  apply(ctx, { providers: ['n1n'], models: ['deepseek-v4.1-flash'] });
  const assemble = ctx.handlers.get('system-prompt/assemble');

  const allowed = assemblyFor('n1n', 'deepseek-v4.1-flash');
  assert.deepEqual((await assemble(allowed, {}, async () => allowed)).tools, []);

  const blocked = assemblyFor('n1n', 'glm-5.3');
  assert.equal((await assemble(blocked, {}, async () => blocked)).tools.length, 2);
});
