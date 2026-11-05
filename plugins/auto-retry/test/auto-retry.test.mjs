/**
 * Behavioural tests for the auto-retry Host half.
 *
 * The plugin imports nothing from the Harness, so it can be driven by a fake
 * context that records listeners and replays the exact event payloads the
 * agent loop dispatches.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, inject, name } from '../index.js';

/** Minimal stand-in for the Cordis context the Host half touches. */
function makeContext(sessionId = 'session-1') {
  const listeners = new Map();
  const appended = [];
  const agent = {
    id: sessionId,
    session: {
      id: sessionId,
      append(type, data) {
        appended.push({ type, data });
      }
    },
    status: 'idle',
    followups: [],
    followup(message) {
      this.followups.push(message);
      emit('agent/inbox/inserted', { agent: this, message });
    }
  };
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    on(event, handler) {
      const bucket = listeners.get(event);
      if (bucket === undefined) listeners.set(event, [handler]);
      else bucket.push(handler);
      return () => {};
    },
    effect(callback) {
      return callback();
    },
    agents: {
      get(id) {
        return id === agent.id ? agent : undefined;
      }
    }
  };
  /** Dispatch one event to every recorded listener. */
  function emit(event, ...args) {
    for (const handler of listeners.get(event) ?? []) handler(...args);
  }
  return { ctx, agent, emit, listeners, appended };
}

/** One dispatched model-request failure. */
function requestFailure(agent, overrides = {}) {
  return {
    agent,
    turn: 1,
    step: 1,
    provider: 'deepseek',
    signal: new AbortController().signal,
    failure: { code: 'RATE_LIMIT', message: 'slow down', status: 429, ...overrides }
  };
}

/** One committed `turn/end` session event. */
function turnEnd(reason) {
  return { type: 'turn/end', data: { turn: 1, reason } };
}

/** Resolve after the given delay. */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('exports a patchable Host plugin', () => {
  assert.equal(name, 'auto-retry');
  assert.deepEqual(inject, ['agents']);
});

test('retries a transient request failure until the budget is spent', async () => {
  const { ctx, agent, listeners } = makeContext();
  apply(ctx, { initialRetryDelayMs: 1, maxRetryDelayMs: 2, jitterRatio: 0, maxRequestRetries: 2 });
  const [retry] = listeners.get('agent/request-error');
  const payload = requestFailure(agent);
  let delegated = 0;
  const next = async () => {
    delegated += 1;
    return undefined;
  };

  assert.deepEqual(await retry(payload, next), { kind: 'retry' });
  assert.deepEqual(await retry(payload, next), { kind: 'retry' });
  assert.equal(await retry(payload, next), undefined);
  assert.equal(delegated, 1, 'only the exhausted attempt reaches the default action');
});

test('publishes a visible llm/retry notice so the retry is not a silent stall', async () => {
  const { ctx, agent, listeners, appended } = makeContext();
  apply(ctx, { initialRetryDelayMs: 1, maxRetryDelayMs: 2, jitterRatio: 0, maxRequestRetries: 3 });
  const [retry] = listeners.get('agent/request-error');
  const payload = requestFailure(agent);

  assert.deepEqual(await retry(payload, async () => undefined), { kind: 'retry' });

  assert.deepEqual(appended.map((entry) => entry.type), ['llm/retry', 'llm/retry-started']);
  const [scheduled, started] = appended;
  // Shape mirrors what @deepseek-ai/dsh-llm-retry writes, so the built-in
  // RetryNodeView renders it as "正在重试模型请求（1/3） · Ns".
  assert.equal(scheduled.data.mode, 'normal');
  assert.equal(scheduled.data.retry, 1);
  assert.equal(scheduled.data.maxRetries, 3);
  assert.equal(scheduled.data.turn, 1);
  assert.equal(scheduled.data.step, 1);
  assert.equal(scheduled.data.provider, 'deepseek');
  assert.ok(scheduled.data.delayMs >= 1);
  assert.equal(scheduled.data.failure.code, 'RATE_LIMIT');
  assert.equal(typeof scheduled.data.retryId, 'string');
  assert.equal(scheduled.data.policyKey, 'auto-retry');
  // A second attempt joins the same chain instead of opening a new row.
  await retry(payload, async () => undefined);
  assert.equal(appended[2].data.retryId, scheduled.data.retryId);
  assert.equal(appended[2].data.retry, 2);
  assert.equal(started.data.retry, 1);
  assert.equal(started.data.retryId, scheduled.data.retryId);
});

test('never restarts a spent retry chain in the same turn/step', async () => {
  // Regression for a corrupted-log bug: the budget counter used to be deleted
  // when it ran out while the visible chain kept its retryId, so the next
  // failure wrote retry=1 again under the old id. The v4 session format
  // rejects that ("llm/retry skips its policy attempt sequence"), which only
  // shows up the next time the session is loaded.
  const { ctx, agent, listeners, appended } = makeContext();
  const maxRequestRetries = 6;
  apply(ctx, { initialRetryDelayMs: 1, maxRetryDelayMs: 2, jitterRatio: 0, maxRequestRetries });
  const [retry] = listeners.get('agent/request-error');
  const payload = requestFailure(agent);
  let delegated = 0;
  const next = async () => {
    delegated += 1;
    return undefined;
  };

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await retry(payload, next);
  }

  const scheduled = appended.filter((entry) => entry.type === 'llm/retry');
  // Exactly one chain, numbered 1..max with no restart and no gap.
  assert.deepEqual(scheduled.map((entry) => entry.data.retry), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(scheduled.map((entry) => entry.data.retryId)).size, 1, 'one retryId per policy chain');
  // Everything past the budget is handed to the built-in retry policy.
  assert.equal(delegated, 40 - maxRequestRetries);
});

test('llm/retry-started never repeats a scheduled attempt', async () => {
  const { ctx, agent, listeners, appended } = makeContext();
  apply(ctx, { initialRetryDelayMs: 1, maxRetryDelayMs: 2, jitterRatio: 0, maxRequestRetries: 4 });
  const [retry] = listeners.get('agent/request-error');
  const payload = requestFailure(agent);
  for (let attempt = 0; attempt < 12; attempt += 1) await retry(payload, async () => undefined);

  const scheduled = appended.filter((entry) => entry.type === 'llm/retry').map((entry) => entry.data);
  const started = appended.filter((entry) => entry.type === 'llm/retry-started').map((entry) => entry.data);
  const pair = (data) => `${data.retryId}:${data.retry}`;

  assert.equal(new Set(started.map(pair)).size, started.length, 'no started attempt repeats');
  assert.deepEqual(started.map(pair), scheduled.map(pair), 'every start pairs a scheduled attempt');
});

test('a new turn opens a new chain with a fresh retryId', async () => {
  const { ctx, agent, listeners, emit, appended } = makeContext();
  apply(ctx, { initialRetryDelayMs: 1, maxRetryDelayMs: 2, jitterRatio: 0, maxRequestRetries: 2, resumeAfterFailure: false });
  const [retry] = listeners.get('agent/request-error');

  const first = requestFailure(agent);
  await retry(first, async () => undefined);
  const firstId = appended[0].data.retryId;
  emit('session/event', agent.session, turnEnd({ kind: 'completed' }));

  // Next turn, same step number: the budget is fresh and the chain is new.
  const second = { ...requestFailure(agent), turn: 2 };
  await retry(second, async () => undefined);

  const scheduled = appended.filter((entry) => entry.type === 'llm/retry').map((entry) => entry.data);
  assert.deepEqual(scheduled.map((entry) => entry.retry), [1, 1]);
  assert.notEqual(scheduled[1].retryId, firstId, 'a new chain must not reuse an earlier retryId');
});

test('a broken session.append cannot cancel the retry', async () => {
  const { ctx, agent, listeners } = makeContext();
  agent.session.append = () => {
    throw new Error('session is closed');
  };
  apply(ctx, { initialRetryDelayMs: 1, maxRetryDelayMs: 2, jitterRatio: 0, maxRequestRetries: 2 });
  const [retry] = listeners.get('agent/request-error');

  assert.deepEqual(await retry(requestFailure(agent), async () => undefined), { kind: 'retry' });
});

test('never retries an authoritative or aborted failure', async () => {
  const { ctx, agent, listeners } = makeContext();
  apply(ctx, { initialRetryDelayMs: 1, maxRequestRetries: 5 });
  const [retry] = listeners.get('agent/request-error');
  let delegated = 0;
  const next = async () => {
    delegated += 1;
    return undefined;
  };

  // An authoritative code wins even when the transport reports a retryable status.
  await retry(requestFailure(agent, { code: 'INVALID_API_KEY', status: 401 }), next);
  await retry(requestFailure(agent, { code: 'CONTEXT_LENGTH_EXCEEDED', status: 429 }), next);
  await retry(requestFailure(agent, { code: 'INSUFFICIENT_BALANCE', status: 429 }), next);
  const aborted = new AbortController();
  aborted.abort();
  await retry({ ...requestFailure(agent), signal: aborted.signal }, next);
  assert.equal(delegated, 4, 'each non-retryable case delegates to the default action');
});

test('resumes the session after a turn that ended with an error', async () => {
  const { ctx, agent, emit } = makeContext();
  apply(ctx, { initialResumeDelayMs: 1, maxResumeDelayMs: 2, jitterRatio: 0, maxConsecutiveResumes: 3 });
  emit('session/event', agent.session, turnEnd({ kind: 'error', error: { code: 'UPSTREAM_ERROR', message: 'socket closed' } }));
  await wait(30);

  assert.equal(agent.followups.length, 1);
  const [message] = agent.followups;
  assert.equal(message.role, 'user');
  assert.equal(message.source.kind, 'auto-retry');
  assert.equal(message.source.attempt, 1);
  assert.match(message.content[0].text, /<auto_resume>/);
  assert.match(message.content[0].text, /第 1\/3 次自动续跑/);
  assert.match(message.content[0].text, /UPSTREAM_ERROR/);
});

test('does not resume after a completed or user-cancelled turn', async () => {
  const { ctx, agent, emit } = makeContext();
  apply(ctx, { initialResumeDelayMs: 1, maxResumeDelayMs: 2, jitterRatio: 0 });
  emit('session/event', agent.session, turnEnd({ kind: 'completed' }));
  emit('session/event', agent.session, turnEnd({ kind: 'aborted', reason: { kind: 'user' } }));
  emit('session/event', agent.session, turnEnd({ kind: 'error', error: { code: 'AUTH_REQUIRED', message: 'sign in' } }));
  await wait(30);
  assert.equal(agent.followups.length, 0);
});

test('stops resuming once the consecutive budget is exhausted', async () => {
  const { ctx, agent, emit } = makeContext();
  apply(ctx, { initialResumeDelayMs: 1, maxResumeDelayMs: 2, jitterRatio: 0, maxConsecutiveResumes: 2 });
  for (let round = 0; round < 4; round += 1) {
    emit('session/event', agent.session, turnEnd({ kind: 'error', error: { code: 'STREAM_ERROR', message: 'eof' } }));
    await wait(20);
  }
  assert.equal(agent.followups.length, 2, 'the third and fourth failures stay terminal');
});

test('a completed turn resets the consecutive budget', async () => {
  const { ctx, agent, emit } = makeContext();
  apply(ctx, { initialResumeDelayMs: 1, maxResumeDelayMs: 2, jitterRatio: 0, maxConsecutiveResumes: 1 });
  emit('session/event', agent.session, turnEnd({ kind: 'error', error: { code: 'STREAM_ERROR', message: 'eof' } }));
  await wait(20);
  assert.equal(agent.followups.length, 1);
  emit('session/event', agent.session, turnEnd({ kind: 'completed' }));
  emit('session/event', agent.session, turnEnd({ kind: 'error', error: { code: 'STREAM_ERROR', message: 'eof' } }));
  await wait(20);
  assert.equal(agent.followups.length, 2);
});

test('a human message cancels the pending resume', async () => {
  const { ctx, agent, emit } = makeContext();
  apply(ctx, { initialResumeDelayMs: 40, maxResumeDelayMs: 40, jitterRatio: 0 });
  emit('session/event', agent.session, turnEnd({ kind: 'error', error: { code: 'STREAM_ERROR', message: 'eof' } }));
  emit('agent/inbox/inserted', { agent, message: { id: 'm1', role: 'user', content: [], source: { kind: 'user' } } });
  await wait(80);
  assert.equal(agent.followups.length, 0);
});

test('the continuation prompt is configurable', async () => {
  const { ctx, agent, emit } = makeContext();
  apply(ctx, { initialResumeDelayMs: 1, maxResumeDelayMs: 2, jitterRatio: 0, continuationPrompt: '接着干' });
  emit('session/event', agent.session, turnEnd({ kind: 'error', error: { code: 'STREAM_ERROR', message: 'eof' } }));
  await wait(30);
  assert.equal(agent.followups[0].content[0].text, '接着干');
});

test('a busy or disposed agent is not resumed', async () => {
  const { ctx, agent, emit } = makeContext();
  apply(ctx, { initialResumeDelayMs: 1, maxResumeDelayMs: 2, jitterRatio: 0 });
  agent.status = 'running';
  emit('session/event', agent.session, turnEnd({ kind: 'error', error: { code: 'STREAM_ERROR', message: 'eof' } }));
  await wait(30);
  assert.equal(agent.followups.length, 0);

  agent.status = 'idle';
  ctx.agents.get = () => undefined;
  emit('session/event', agent.session, turnEnd({ kind: 'error', error: { code: 'STREAM_ERROR', message: 'eof' } }));
  await wait(30);
  assert.equal(agent.followups.length, 0);
});

test('disabled means no observer effect at all', async () => {
  const { ctx, agent, listeners, emit } = makeContext();
  apply(ctx, { enabled: false, initialRetryDelayMs: 1, initialResumeDelayMs: 1, jitterRatio: 0 });
  const [retry] = listeners.get('agent/request-error');
  let delegated = 0;
  await retry(requestFailure(agent), async () => {
    delegated += 1;
    return undefined;
  });
  emit('session/event', agent.session, turnEnd({ kind: 'error', error: { code: 'STREAM_ERROR', message: 'eof' } }));
  await wait(30);
  assert.equal(delegated, 1);
  assert.equal(agent.followups.length, 0);
});
