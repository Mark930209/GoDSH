#!/usr/bin/env node
/**
 * 发布单个插件（monorepo 版本循环）：
 *   bump 版本 -> 更新 CHANGELOG 校验 -> 提交 -> 打 <name>-v<ver> tag -> 刷新市场索引 ->（可选）推送
 *
 * 用法：
 *   node scripts/release.mjs <plugin> <patch|minor|major> "变更摘要" [--push]
 *   node scripts/release.mjs <plugin> patch --dry-run
 *
 * 约定：
 *   - 必须在工作区干净时执行（先提交你的改动）。
 *   - CHANGELOG.md 里应先写好对应版本段落（缺少时只警告，不阻断）。
 *   - 索引里的 commit 自动指向 tag 所在提交。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const positional = argv.filter((value) => !value.startsWith('--'));
const push = argv.includes('--push');
const dryRun = argv.includes('--dry-run');

function fail(message) {
  console.error('[release] ' + message);
  process.exit(1);
}
const name = positional[0];
const bump = positional[1];
const summary = positional.slice(2).join(' ') || undefined;
if (!name || !bump) fail('用法: node scripts/release.mjs <plugin> <patch|minor|major> ["变更摘要"] [--push]');
if (!['patch', 'minor', 'major'].includes(bump)) fail('bump 只接受 patch / minor / major');
const pluginDir = join(root, 'plugins', name);
if (!existsSync(join(pluginDir, 'package.json'))) fail('找不到插件: plugins/' + name);

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: options.stdio || 'pipe' }).trim();
}

const dirty = git(['status', '--porcelain']);
if (dirty !== '') fail('工作区不干净，先提交或暂存改动:\n' + dirty);

const pkgPath = join(pluginDir, 'package.json');
const before = JSON.parse(readFileSync(pkgPath, 'utf8')).version;

if (dryRun) {
  console.log('[release] --dry-run：' + name + ' 将从 ' + before + ' 执行 ' + bump + ' 升版本，不做任何修改。');
  process.exit(0);
}

// 1) 版本 bump（不自动打 tag，由脚本统一打带前缀的 tag）
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['version', bump, '--no-git-tag-version', '--allow-same-version'], { cwd: pluginDir, stdio: 'inherit' });
const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
if (version === before) fail('版本未变化，中止');

// 2) CHANGELOG 提醒
const changelogPath = join(pluginDir, 'CHANGELOG.md');
if (existsSync(changelogPath) && !readFileSync(changelogPath, 'utf8').includes('[' + version + ']')) {
  console.warn('[release] 警告：CHANGELOG.md 里没有 [' + version + '] 段落，记得补。');
}

// 3) 提交
git(['add', '-A']);
git(['commit', '-m', 'chore(' + name + '): release v' + version + (summary ? ' — ' + summary : '')]);

// 4) 打 tag
const tag = name + '-v' + version;
git(['tag', '-a', tag, '-m', tag]);

// 5) 刷新市场索引（--commit 默认 HEAD = tag 提交）
execFileSync(process.execPath, [join(root, 'scripts', 'make-market-index.mjs')], { cwd: root, stdio: 'inherit' });
git(['add', 'docs/market-index.json']);
const staged = git(['diff', '--cached', '--name-only']);
if (staged !== '') git(['commit', '-m', 'chore: refresh market index for ' + name + ' v' + version]);

if (push) {
  git(['push', 'origin', 'HEAD', '--follow-tags'], { stdio: 'inherit' });
  console.log('[release] 已推送 ' + tag);
} else {
  console.log('[release] 完成：' + tag + '。推送请执行：');
  console.log('  git push origin HEAD --follow-tags');
}
