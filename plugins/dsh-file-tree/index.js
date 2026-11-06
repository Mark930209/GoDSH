/**
 * Host half of the file-tree context-menu bundle.
 *
 * The Client module owns the menu; this half supplies the capabilities the
 * renderer cannot provide itself: authenticated file creation, rename, delete
 * (Recycle Bin), opening an OS terminal at a workspace folder, and reading the
 * workspace's Git status for row decorations and the menu summary.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROUTE = '/api/dft.fileops';
const GIT_ROUTE = '/api/dft.git';
const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const GIT_TIMEOUT = 15000;
const GIT_MAX_BUFFER = 4 * 1024 * 1024;

/** Run one git command in a fixed repository, with locks disabled and a bounded read. */
async function git(root, args, options = {}) {
  const result = await execFileAsync('git', ['-C', root, ...args], {
    cwd: root,
    windowsHide: true,
    timeout: options.timeout === undefined ? GIT_TIMEOUT : options.timeout,
    maxBuffer: options.maxBuffer === undefined ? GIT_MAX_BUFFER : options.maxBuffer,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' }
  });
  return result.stdout;
}

/** Map one porcelain XY code to the tone/letter the file tree and menu paint. */
function gitStatusOf(xy) {
  if (xy === '??') return { letter: 'U', tone: 'untracked', staged: false, unstaged: true };
  if (xy.length < 2 || xy === '!!') return undefined;
  const x = xy[0];
  const y = xy[1];
  if (x === ' ' && y === ' ') return undefined;
  const staged = x !== ' ' && x !== '?';
  const unstaged = y !== ' ' && y !== '?';
  const code = x !== ' ' && x !== '?' ? x : y;
  const tone = x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')
    ? 'conflict'
    : code === 'M' || code === 'T' ? 'modified'
      : code === 'A' ? 'added'
        : code === 'D' ? 'deleted'
          : code === 'R' ? 'renamed'
            : code === 'C' ? 'copied'
              : 'modified';
  return { letter: tone === 'conflict' ? '!' : code, tone, staged, unstaged };
}

/**
 * Parse `git status --porcelain=v2 --branch -z` into branch metadata and
 * changed paths. Fixed v2 fields are counted, never split on names, so paths
 * containing spaces survive. A rename's second NUL field (the old path) is
 * skipped.
 */
function parseGitStatus(raw) {
  const result = { branch: null, detached: false, upstream: null, ahead: 0, behind: 0, entries: [] };
  const tokens = raw.split('\0');
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '') continue;
    if (token.startsWith('# ')) {
      if (token.startsWith('# branch.head ')) {
        const head = token.slice(14);
        result.detached = head === '(detached)';
        if (!result.detached && head !== '(unknown)') result.branch = head;
      } else if (token.startsWith('# branch.upstream ')) {
        result.upstream = token.slice(18);
      } else if (token.startsWith('# branch.ab ')) {
        const counts = /^# branch\.ab \+(\d+) -(\d+)$/.exec(token);
        if (counts !== null) {
          result.ahead = Number(counts[1]);
          result.behind = Number(counts[2]);
        }
      }
      continue;
    }
    let fixed;
    if (token.startsWith('u ')) fixed = 10;
    else if (token.startsWith('2 ')) fixed = 9;
    else if (token.startsWith('1 ')) fixed = 8;
    else if (token.startsWith('? ')) {
      const path = token.slice(2);
      if (path === '') continue;
      const status = gitStatusOf('??');
      result.entries.push({ path, ...status });
      continue;
    } else continue;
    const path = token.split(' ').slice(fixed).join(' ');
    if (path === '') continue;
    const xy = token.slice(2, 4).replace(/\./g, ' ');
    const status = gitStatusOf(xy);
    if (status === undefined) continue;
    result.entries.push({ path, ...status });
    if (token.startsWith('2 ')) index += 1;
  }
  return result;
}

/** Read the operation a repository is paused in (merge/rebase/cherry-pick/...). */
async function gitOperation(gitDir) {
  const checks = [
    ['MERGE_HEAD', 'merge'],
    ['rebase-merge', 'rebase'],
    ['rebase-apply', 'rebase'],
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['REVERT_HEAD', 'revert'],
    ['BISECT_LOG', 'bisect']
  ];
  for (const [name, operation] of checks) {
    try {
      await fsp.access(path.join(gitDir, name));
      return operation;
    } catch (_error) {
      // keep looking
    }
  }
  return null;
}

/** Read one workspace root's git status for the client decorations and menu. */
async function readGitStatus(root) {
  let gitRoot;
  try {
    gitRoot = path.resolve(root, (await git(root, ['rev-parse', '--show-toplevel'])).trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not a git repository/i.test(message)) return { isRepo: false, reason: 'not-a-repo' };
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return { isRepo: false, reason: 'git-unavailable' };
    return { isRepo: false, reason: 'git-error', error: message };
  }
  const relative = path.relative(gitRoot, root).replace(/\\/g, '/');
  const args = ['status', '--porcelain=v2', '--branch', '--ahead-behind', '-z', '--untracked-files=all'];
  if (relative !== '') args.push('--', relative);
  const raw = await git(gitRoot, args);
  const parsed = parseGitStatus(raw);
  let operation = null;
  try {
    const gitDirRaw = (await git(gitRoot, ['rev-parse', '--absolute-git-dir'])).trim();
    operation = await gitOperation(path.resolve(gitDirRaw));
  } catch (_error) {
    // A repository can still be read even when its operations cannot.
  }
  const entries = [];
  for (const entry of parsed.entries) {
    const absolute = path.resolve(gitRoot, entry.path);
    if (!insideRoot(root, absolute) && !isRootItself(root, absolute)) continue;
    entries.push({ ...entry, absolute });
  }
  const counts = { total: entries.length, staged: 0, unstaged: 0, untracked: 0, conflict: 0 };
  for (const entry of entries) {
    if (entry.staged) counts.staged += 1;
    if (entry.unstaged) counts.unstaged += 1;
    if (entry.tone === 'untracked') counts.untracked += 1;
    if (entry.tone === 'conflict') counts.conflict += 1;
  }
  return {
    isRepo: true,
    repoRoot: gitRoot,
    branch: parsed.branch,
    detached: parsed.detached,
    upstream: parsed.upstream,
    ahead: parsed.ahead,
    behind: parsed.behind,
    operation,
    entries,
    counts
  };
}

/** Answer every route outcome as JSON, never as a thrown Cordis error. */
function json(status, data) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

/** Validate one user-supplied leaf name (no separators, no trailing dot/space). */
function validName(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') return false;
  if (trimmed !== name) return false;
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name)) return false;
  if (/[. ]$/.test(name)) return false;
  return !RESERVED.test(name);
}

/** Resolve an absolute path and reject anything outside the stated workspace root. */
function insideRoot(root, target) {
  if (typeof root !== 'string' || root.trim() === '' || !path.isAbsolute(root)) return false;
  if (typeof target !== 'string' || target.trim() === '' || !path.isAbsolute(target)) return false;
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** True when target equals the workspace root itself. */
function isRootItself(root, target) {
  return path.resolve(root).toLowerCase() === path.resolve(target).toLowerCase();
}

/** Move a file or directory to the Windows Recycle Bin. */
async function recycle(target) {
  if (process.platform !== 'win32') throw new Error('Recycle Bin is only supported on Windows.');
  const encoded = Buffer.from(target, 'utf8').toString('base64');
  const script = [
    "$ErrorActionPreference='Stop'",
    "$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + encoded + "'))",
    'Add-Type -AssemblyName Microsoft.VisualBasic',
    'if ([IO.Directory]::Exists($p)) {',
    "  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p,'OnlyErrorDialogs','SendToRecycleBin')",
    '} elseif ([IO.File]::Exists($p)) {',
    "  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,'OnlyErrorDialogs','SendToRecycleBin')",
    '} else {',
    "  throw 'Not found'",
    '}'
  ].join('; ');
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
}

/** Open a detached PowerShell in the given directory, with no shell interpolation of the path. */
function openTerminal(target) {
  if (process.platform !== 'win32') throw new Error('Terminal launch is only supported on Windows.');
  const command = 'start "" powershell.exe -NoExit -Command "Set-Location -LiteralPath $env:DSH_DFT_DIR"';
  const child = spawn('cmd.exe', ['/d', '/s', '/c', command], {
    env: { ...process.env, DSH_DFT_DIR: target },
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
}

/** Handle one git-status POST from the client. */
async function handleGit(request) {
  let body;
  try {
    body = await request.json();
  } catch (_error) {
    return json(400, { ok: false, error: 'Invalid JSON body.' });
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { ok: false, error: 'Invalid request body.' });
  }
  const root = body.root;
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    return json(400, { ok: false, error: 'Workspace root must be an absolute path.' });
  }
  try {
    const stat = await fsp.stat(root);
    if (!stat.isDirectory()) return json(400, { ok: false, error: 'Workspace root is not a directory.' });
    const snapshot = await readGitStatus(path.resolve(root));
    return json(200, { ok: true, ...snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { ok: false, error: message });
  }
}

/** Handle one POST from the client menu. */
async function handle(request) {
  let body;
  try {
    body = await request.json();
  } catch (_error) {
    return json(400, { ok: false, error: 'Invalid JSON body.' });
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { ok: false, error: 'Invalid request body.' });
  }
  const op = body.op;
  const root = body.root;
  try {
    if (op === 'terminal') {
      if (!insideRoot(root, body.target)) return json(403, { ok: false, error: 'Target is outside the workspace.' });
      const stat = await fsp.stat(body.target);
      if (!stat.isDirectory()) return json(400, { ok: false, error: 'Target is not a directory.' });
      openTerminal(path.resolve(body.target));
      return json(200, { ok: true, path: path.resolve(body.target) });
    }

    if (op === 'mkdir' || op === 'newFile') {
      if (!insideRoot(root, body.parent)) return json(403, { ok: false, error: 'Parent is outside the workspace.' });
      if (!validName(body.name)) return json(400, { ok: false, error: 'Invalid name.' });
      const target = path.join(path.resolve(body.parent), body.name);
      if (!insideRoot(root, target)) return json(403, { ok: false, error: 'Target is outside the workspace.' });
      if (op === 'mkdir') await fsp.mkdir(target);
      else await fsp.writeFile(target, '', { flag: 'wx', encoding: 'utf8' });
      return json(200, { ok: true, path: target });
    }

    if (op === 'rename') {
      if (!insideRoot(root, body.target) || isRootItself(root, body.target)) {
        return json(403, { ok: false, error: 'Target is outside the workspace.' });
      }
      if (!validName(body.name)) return json(400, { ok: false, error: 'Invalid name.' });
      const target = path.join(path.dirname(path.resolve(body.target)), body.name);
      if (!insideRoot(root, target)) return json(403, { ok: false, error: 'Target is outside the workspace.' });
      try {
        await fsp.lstat(target);
        return json(409, { ok: false, error: 'An entry with that name already exists.' });
      } catch (error) {
        if (error === null || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
      }
      await fsp.rename(path.resolve(body.target), target);
      return json(200, { ok: true, path: target });
    }

    if (op === 'trash') {
      if (!insideRoot(root, body.target) || isRootItself(root, body.target)) {
        return json(403, { ok: false, error: 'Target is outside the workspace.' });
      }
      const stat = await fsp.lstat(path.resolve(body.target));
      if (stat === null) return json(404, { ok: false, error: 'Not found.' });
      await recycle(path.resolve(body.target));
      return json(200, { ok: true, path: path.resolve(body.target) });
    }

    return json(400, { ok: false, error: 'Unknown operation.' });
  } catch (error) {
    const code = error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : '';
    const message = error instanceof Error ? error.message : String(error);
    if (code === 'ENOENT') return json(404, { ok: false, error: 'Not found.' });
    if (code === 'EEXIST') return json(409, { ok: false, error: 'An entry with that name already exists.' });
    return json(500, { ok: false, error: message });
  }
}

export const name = 'dsh-file-tree';
export const inject = ['connection'];

/** Register the host route for the duration of the plugin. */
export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handle(request)
  }), 'dsh-file-tree: host file operations');
  ctx.effect(() => ctx.connection.fetch.register({
    path: GIT_ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handleGit(request)
  }), 'dsh-file-tree: host git status');
}
