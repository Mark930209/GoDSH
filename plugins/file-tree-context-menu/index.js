/**
 * Host half of the file-tree context-menu bundle.
 *
 * The Client module owns the menu; this half supplies the one capability the
 * renderer cannot provide itself: authenticated file creation, rename, delete
 * (Recycle Bin) and opening an OS terminal at a workspace folder.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROUTE = '/api/ftcm.fileops';
const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

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
  const command = 'start "" powershell.exe -NoExit -Command "Set-Location -LiteralPath $env:DSH_FTCM_DIR"';
  const child = spawn('cmd.exe', ['/d', '/s', '/c', command], {
    env: { ...process.env, DSH_FTCM_DIR: target },
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
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

export const name = 'file-tree-context-menu';
export const inject = ['connection'];

/** Register the host route for the duration of the plugin. */
export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handle(request)
  }), 'file-tree-context-menu: host file operations');
}
