#!/usr/bin/env node
/**
 * 校验 plugins/ 下的插件包（本地与 CI 共用）。
 *
 * 用法：
 *   node scripts/validate-plugins.mjs                     # 全部插件
 *   node scripts/validate-plugins.mjs --since origin/main # 仅校验该 ref 以来改动过的插件
 *   node scripts/validate-plugins.mjs --plugin <name>     # 只校验一个插件
 *   node scripts/validate-plugins.mjs --json              # 机器可读输出
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);

function argValue(name) {
  const at = argv.indexOf('--' + name);
  if (at === -1) return undefined;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith('--')) fail('--' + name + ' 缺少取值');
  return value;
}
function fail(message) {
  console.error('[validate] ' + message);
  process.exit(1);
}

const since = argValue('since');
const only = argValue('plugin');
const asJson = argv.includes('--json');

const NUMERIC = '(?:0|[1-9]\\d*)';
const PRERELEASE = '(?:' + NUMERIC + '|\\d*[a-zA-Z-][0-9a-zA-Z-]*)';
const SEMVER = new RegExp('^' + NUMERIC + '\\.' + NUMERIC + '\\.' + NUMERIC +
  '(?:-' + PRERELEASE + '(?:\\.' + PRERELEASE + ')*)?' +
  '(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?$', 'u');
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;

const pluginsDir = join(root, 'plugins');
if (!existsSync(pluginsDir)) fail('找不到 plugins 目录: ' + pluginsDir);

let names = readdirSync(pluginsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(pluginsDir, entry.name, 'package.json')))
  .map((entry) => entry.name)
  .sort();

if (only !== undefined) {
  if (!names.includes(only)) fail('找不到插件: plugins/' + only);
  names = [only];
}
if (since !== undefined) {
  let changed = [];
  try {
    changed = execFileSync('git', ['diff', '--name-only', since + '...HEAD'], { cwd: root, encoding: 'utf8' })
      .split(/\r?\n/u).filter(Boolean);
  } catch {
    fail('无法执行 git diff ' + since + '...HEAD');
  }
  const touched = new Set(changed.filter((p) => p.startsWith('plugins/')).map((p) => p.split('/')[1]));
  names = names.filter((n) => touched.has(n));
  if (names.length === 0) {
    console.log('[validate] 自 ' + since + ' 以来没有插件改动，跳过。');
    process.exit(0);
  }
}

const results = [];
for (const name of names) {
  const dir = join(pluginsDir, name);
  const problems = [];
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  } catch (error) {
    problems.push('package.json 解析失败: ' + error.message);
  }
  if (pkg) {
    if (typeof pkg.name !== 'string' || !PACKAGE_NAME.test(pkg.name)) problems.push('包名不合法: ' + pkg.name);
    if (typeof pkg.version !== 'string' || !SEMVER.test(pkg.version)) problems.push('版本不是精确 SemVer: ' + pkg.version);
    if (!pkg.dsh || !pkg.dsh.bundle || typeof pkg.dsh.bundle.patch !== 'string') problems.push('缺少 dsh.bundle.patch');
  }
  const patchPath = join(dir, 'cordis.patch.yml');
  if (!existsSync(patchPath)) problems.push('缺少 cordis.patch.yml');

  // index.js 是每个 bundle 的 Host 入口；client.js 只有声明了 dsh.client 的
  // 插件才必需（Host-only 策略插件没有 Client 半部）。
  const expected = pkg && pkg.dsh && pkg.dsh.client !== undefined ? ['index.js', 'client.js'] : ['index.js'];
  for (const js of expected) {
    const file = join(dir, js);
    if (!existsSync(file)) {
      problems.push('缺少 ' + js);
      continue;
    }
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
      problems.push(js + ' 语法检查失败: ' + String(error.stderr || error.message).trim().split(/\r?\n/u)[0]);
    }
  }
  // Client module id contract: the browser module system keys rows by the
  // package name (the Host builds each boot row from the loader entry's name,
  // which the bundle patch sets to the package name). A client.js that
  // registers under any other id is unresolvable in the browser, so the whole
  // plugin silently fails to load — catch it here instead of at runtime.
  if (pkg && pkg.dsh && pkg.dsh.client !== undefined && typeof pkg.name === 'string' && existsSync(join(dir, 'client.js'))) {
    const source = readFileSync(join(dir, 'client.js'), 'utf8');
    const registered = /__ModuleLoader__\.load\(\s*\{[\s\S]{0,2000}?\bid:\s*'([^']+)'/u.exec(source);
    if (registered === null) {
      problems.push('client.js 没有用 __ModuleLoader__.load({ id }) 注册模块');
    } else if (registered[1] !== pkg.name) {
      problems.push('client.js 的模块 id "' + registered[1] + '" 与包名 "' + pkg.name + '" 不一致');
    }
  }

  for (const locale of ['zh.json', 'en.json']) {
    const file = join(dir, 'locale', locale);
    if (!existsSync(file)) continue;
    try {
      JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      problems.push('locale/' + locale + ' 解析失败: ' + error.message);
    }
  }
  results.push({ name, version: pkg && pkg.version, ok: problems.length === 0, problems });
}

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const result of results) {
    if (result.ok) console.log('[ok]   ' + result.name + '@' + result.version);
    else {
      console.log('[fail] ' + result.name + '@' + result.version);
      for (const problem of result.problems) console.log('       - ' + problem);
    }
  }
}

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  if (!asJson) console.error('[validate] ' + failed.length + '/' + results.length + ' 个插件未通过。');
  process.exit(1);
}
if (!asJson) console.log('[validate] 全部通过（' + results.length + ' 个插件）。');
