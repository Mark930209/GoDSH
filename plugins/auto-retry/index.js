/**
 * Host half of the auto-retry bundle.
 *
 * Two recovery layers for a failed round:
 *
 *   1. `agent/request-error` — one failed model request is retried after an
 *      exponential backoff, so a transient provider outage (rate limit,
 *      overloaded, timeout, connection reset, 5xx) never ends the turn. The
 *      loop retries the same step without re-appending the user message, so
 *      this layer is side-effect free.
 *
 *   2. `turn/end` with reason `error` — when a turn still fails (the retry
 *      budget above is spent, or the failure was not a model request), the
 *      same session is resumed after a delay with one follow-up prompt, up to
 *      a bounded number of consecutive resumes. A turn that ends any other way
 *      resets that budget.
 *
 * The plugin only observes durable session facts and public agent methods; it
 * appends no session event of its own.
 */
import { randomUUID } from 'node:crypto';

/** Failure codes that a later attempt cannot fix. */
const FATAL_CODE_PATTERNS = [
  'AUTH',
  'API_KEY',
  'APIKEY',
  'UNAUTHOR',
  'FORBIDDEN',
  'PERMISSION',
  'NO_ADAPTER',
  'NOADAPTER',
  'INVALID',
  'BAD_REQUEST',
  'BADREQUEST',
  'CONTEXT_LENGTH',
  'CONTEXT_OVERFLOW',
  'CONTENT_FILTER',
  'SAFETY',
  'QUOTA',
  'BALANCE',
  'INSUFFICIENT',
  'NOT_SUPPORTED',
  'UNSUPPORTED',
  'CANCEL',
  'ABORT'
];

/** HTTP statuses that a later attempt can usually fix. */
const TRANSIENT_STATUS = new Set([408, 409, 425, 429]);

/** Build the effective options from the patch row's raw `config`. */
function resolveOptions(config) {
  const raw = config !== null && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const num = (key, fallback, min, max) => {
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  };
  const int = (key, fallback, min, max) => Math.round(num(key, fallback, min, max));
  const bool = (key, fallback) => (typeof raw[key] === 'boolean' ? raw[key] : fallback);
  return {
    enabled: bool('enabled', true),
    maxRequestRetries: int('maxRequestRetries', 6, 0, 50),
    initialRetryDelayMs: int('initialRetryDelayMs', 2000, 0, 600000),
    maxRetryDelayMs: int('maxRetryDelayMs', 60000, 0, 3600000),
    jitterRatio: num('jitterRatio', 0.2, 0, 1),
    resumeAfterFailure: bool('resumeAfterFailure', true),
    maxConsecutiveResumes: int('maxConsecutiveResumes', 5, 0, 100),
    initialResumeDelayMs: int('initialResumeDelayMs', 5000, 0, 3600000),
    maxResumeDelayMs: int('maxResumeDelayMs', 120000, 0, 7200000),
    pauseOnUserInput: bool('pauseOnUserInput', true),
    continuationPrompt: typeof raw.continuationPrompt === 'string' ? raw.continuationPrompt : ''
  };
}

/** Shorten free text for a log line or a prompt. */
function truncate(text, limit) {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/** Render one `LlmFailure` for logging. */
function describeFailure(failure) {
  if (failure === null || typeof failure !== 'object') return String(failure);
  const code = typeof failure.code === 'string' && failure.code !== '' ? failure.code : 'UNKNOWN';
  const status = typeof failure.status === 'number' ? ` ${failure.status}` : '';
  const message = typeof failure.message === 'string' ? failure.message : '';
  return `${code}${status}${message === '' ? '' : `: ${truncate(message, 160)}`}`;
}

/**
 * Classify one failure as `transient` (a later attempt may succeed) or `fatal`
 * (retrying cannot help). An aborted turn is never retried: the abort is the
 * user's own decision, and the loop rethrows it right after the waterfall.
 */
function classifyFailure(failure, signal) {
  if (signal !== undefined && signal !== null && signal.aborted === true) return 'fatal';
  const code = failure !== null && typeof failure === 'object' && typeof failure.code === 'string'
    ? failure.code.toUpperCase()
    : '';
  const status = failure !== null && typeof failure === 'object' && typeof failure.status === 'number'
    ? failure.status
    : undefined;
  // A server-side fault is worth another attempt whatever its code says.
  if (status !== undefined && status >= 500) return 'transient';
  // An explicit non-transient code wins over a generic status: quota, balance,
  // and context-length failures are commonly reported as 429 or 400.
  if (code !== '' && FATAL_CODE_PATTERNS.some((pattern) => code.includes(pattern))) return 'fatal';
  if (status !== undefined) {
    if (TRANSIENT_STATUS.has(status)) return 'transient';
    if (status >= 400) return 'fatal';
  }
  // No usable signal left: treat it as a provider/transport hiccup.
  return 'transient';
}

/** Exponential backoff with symmetric jitter, clamped to `maxDelayMs`. */
function backoff(attempt, initialDelayMs, maxDelayMs, jitterRatio) {
  const growth = initialDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(Math.max(maxDelayMs, initialDelayMs), growth);
  if (jitterRatio <= 0) return Math.round(capped);
  const spread = capped * Math.min(1, jitterRatio);
  return Math.max(0, Math.round(capped - spread + Math.random() * spread * 2));
}

/** Delay before retrying one failed request, honouring a provider hint. */
function requestDelay(attempt, failure, options) {
  const hint = failure !== null && typeof failure === 'object' ? failure.providerRetryAfterMs : undefined;
  if (typeof hint === 'number' && Number.isFinite(hint) && hint > 0) {
    return Math.min(options.maxRetryDelayMs, Math.max(hint, options.initialRetryDelayMs));
  }
  return backoff(attempt, options.initialRetryDelayMs, options.maxRetryDelayMs, options.jitterRatio);
}

/** Resolve `true` when the wait elapsed, `false` when the turn was aborted. */
function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    if (signal !== undefined && signal !== null && signal.aborted === true) {
      resolve(false);
      return;
    }
    const done = (elapsed) => {
      clearTimeout(timer);
      if (signal !== undefined && signal !== null && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
      resolve(elapsed);
    };
    const onAbort = () => done(false);
    const timer = setTimeout(() => done(true), ms);
    if (signal !== undefined && signal !== null && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    // Do not keep the process alive only for a pending retry.
    if (typeof timer.unref === 'function') timer.unref();
  });
}

/** Deep-freeze a message the way the host's message factories do. */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

/** Build one identified, immutable user-role message without host imports. */
function createUserMessage(text, source) {
  return deepFreeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source
  });
}

/** The retained continuation prompt for one automatic resume. */
function continuationText(attempt, maxAttempts, error) {
  const code = error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : '';
  const message = error !== null && typeof error === 'object' && typeof error.message === 'string'
    ? truncate(error.message, 300)
    : '';
  const detail = [code, message].filter((part) => part !== '').join(' — ');
  return [
    '<auto_resume>',
    detail === '' ? '上一轮运行意外中断。' : `上一轮运行意外中断：${detail}`,
    `这是第 ${attempt}/${maxAttempts} 次自动续跑。`,
    '',
    '请在同一会话中继续完成原任务：',
    '- 以当前工作区、工具结果与会话记录为准，先核实现状，不要假设之前的叙述仍然成立；',
    '- 接着做尚未完成的步骤，已经成功的副作用操作不要重复执行；',
    '- 如果任务已经完成，直接给出最终结论。',
    '</auto_resume>'
  ].join('\n');
}

export const name = 'auto-retry';
export const inject = ['agents'];

/** Install both recovery layers for the lifetime of the plugin. */
export function apply(ctx, config) {
  const options = resolveOptions(config);
  /** Pending timeouts, so unload never leaves a resume armed. */
  const timers = new Set();
  /** sessionId -> Map<"turn:step", retriesUsed>. */
  const requestAttempts = new Map();
  /** sessionId -> { consecutive, timer }. */
  const resumeState = new Map();

  const note = (level, message) => {
    try {
      ctx.logger[level](`[auto-retry] ${message}`);
    } catch (_error) {
      // A missing logger must never break the recovery path.
    }
  };

  /** Cancel one pending resume timer. */
  const clearResumeTimer = (state) => {
    if (state === undefined || state.timer === undefined) return;
    clearTimeout(state.timer);
    timers.delete(state.timer);
    state.timer = undefined;
  };

  /** Forget the recovery budget for one session. */
  const resetResume = (sessionId) => {
    const state = resumeState.get(sessionId);
    if (state === undefined) return;
    clearResumeTimer(state);
    state.consecutive = 0;
  };

  const stateFor = (sessionId) => {
    const existing = resumeState.get(sessionId);
    if (existing !== undefined) return existing;
    const created = { consecutive: 0, timer: undefined };
    resumeState.set(sessionId, created);
    return created;
  };

  /** Queue the continuation prompt once the agent settled and is still live. */
  const resumeNow = (agent, state, attempt, error) => {
    if (!options.enabled || !options.resumeAfterFailure) return;
    if (ctx.agents.get(agent.id) !== agent) return;
    if (agent.status !== 'idle') {
      // Other work already owns this session; do not pile a prompt on top of it.
      note('info', `agent "${agent.id}": skipped resume ${attempt} because the agent is busy`);
      return;
    }
    state.consecutive = attempt;
    const text = options.continuationPrompt === ''
      ? continuationText(attempt, options.maxConsecutiveResumes, error)
      : options.continuationPrompt;
    try {
      agent.followup(createUserMessage(text, { kind: 'auto-retry', attempt }));
    } catch (thrown) {
      note('warn', `agent "${agent.id}": could not queue resume ${attempt}: ${String(thrown)}`);
      return;
    }
    note('warn', `agent "${agent.id}": queued automatic resume ${attempt}/${options.maxConsecutiveResumes}`);
  };

  /** Arm one delayed resume after a turn ended with an error. */
  const scheduleResume = (agent, reason) => {
    if (!options.enabled || !options.resumeAfterFailure) return;
    const error = reason !== null && typeof reason === 'object' ? reason.error : undefined;
    if (classifyFailure(error, undefined) === 'fatal') {
      resetResume(agent.id);
      note('warn', `agent "${agent.id}": not resuming, the failure is not transient (${describeFailure(error)})`);
      return;
    }
    const state = stateFor(agent.id);
    clearResumeTimer(state);
    if (state.consecutive >= options.maxConsecutiveResumes) {
      note('warn', `agent "${agent.id}": giving up after ${state.consecutive} consecutive resumes`);
      return;
    }
    const attempt = state.consecutive + 1;
    const delay = backoff(attempt, options.initialResumeDelayMs, options.maxResumeDelayMs, options.jitterRatio);
    const timer = setTimeout(() => {
      timers.delete(timer);
      state.timer = undefined;
      try {
        resumeNow(agent, state, attempt, error);
      } catch (thrown) {
        note('warn', `agent "${agent.id}": resume ${attempt} failed: ${String(thrown)}`);
      }
    }, delay);
    if (typeof timer.unref === 'function') timer.unref();
    timers.add(timer);
    state.timer = timer;
    note('warn', `agent "${agent.id}": turn failed (${describeFailure(error)}); resume ${attempt}/${options.maxConsecutiveResumes} scheduled in ${delay}ms`);
  };

  ctx.effect(() => {
    ctx.on('agent/request-error', async (payload, next) => {
      if (!options.enabled || options.maxRequestRetries <= 0) return next();
      const { agent, failure, signal } = payload;
      if (classifyFailure(failure, signal) === 'fatal') return next();

      const key = `${payload.turn}:${payload.step}`;
      let perSession = requestAttempts.get(agent.id);
      if (perSession === undefined) {
        perSession = new Map();
        requestAttempts.set(agent.id, perSession);
      }
      const used = (perSession.get(key) ?? 0) + 1;
      if (used > options.maxRequestRetries) {
        perSession.delete(key);
        note('warn', `agent "${agent.id}": request retry budget spent for turn ${key} (${describeFailure(failure)})`);
        return next();
      }
      perSession.set(key, used);

      const delay = requestDelay(used, failure, options);
      note('warn', `agent "${agent.id}": model request failed (${describeFailure(failure)}); retry ${used}/${options.maxRequestRetries} in ${delay}ms`);
      const elapsed = await sleep(delay, signal);
      if (!elapsed) return next();
      return { kind: 'retry' };
    });

    ctx.on('session/event', (session, event) => {
      if (!options.enabled) return;
      if (event === null || typeof event !== 'object' || event.type !== 'turn/end') return;
      const sessionId = session.id;
      const agent = ctx.agents.get(sessionId);
      if (agent === undefined || agent.session !== session) return;
      const reason = event.data !== null && typeof event.data === 'object' ? event.data.reason : undefined;
      const kind = reason !== null && typeof reason === 'object' ? reason.kind : undefined;
      requestAttempts.delete(sessionId);
      if (kind === 'error') {
        scheduleResume(agent, reason);
        return;
      }
      // completed / aborted / blocked / interrupted / max-tokens / forked:
      // no automatic resume, and the consecutive budget starts over.
      resetResume(sessionId);
    });

    ctx.on('agent/inbox/inserted', ({ agent, message }) => {
      if (!options.pauseOnUserInput) return;
      const source = message !== null && typeof message === 'object' ? message.source : undefined;
      if (source !== null && typeof source === 'object' && source.kind === 'auto-retry') return;
      resetResume(agent.id);
    });

    ctx.on('agent/disposed', ({ agent }) => {
      const state = resumeState.get(agent.id);
      if (state !== undefined) clearResumeTimer(state);
      resumeState.delete(agent.id);
      requestAttempts.delete(agent.id);
    });

    note('info', `active (request retries ${options.maxRequestRetries}, consecutive resumes ${options.maxConsecutiveResumes})`);

    return () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      requestAttempts.clear();
      resumeState.clear();
    };
  }, 'auto-retry: recovery layers');
}
