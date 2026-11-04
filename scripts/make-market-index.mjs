#!/usr/bin/env node
/**
 * 聚合生成 format 1 插件市场索引（默认 docs/market-index.json）。
 *
 * 扫描 plugins/<name>/package.json（要求带 dsh.bundle.patch），每个插件生成一条记录，
 * git 源自动带 path: plugins/<name>，因此 monorepo 也能按插件独立安装。
 *
 * **独立发布语义**：默认只收录已经打过发布 tag 的插件，即 `<插件目录名>-v<package.json 版本>`。
 * 每个插件的 commit / 时间都钉在自己 tag 上，所以重生成索引时已发布条目一字不变——
 * 发布 A 不会顺带把 B 指向新 HEAD，也不会把 B 的更新时间改成"现在"。
 *
 * 用法：
 *   node scripts/make-market-index.mjs                      # 只收录已发布（有 tag）的插件
 *   node scripts/make-market-index.mjs --include-unreleased # 连没有 tag 的插件也收（指向 HEAD）
 *   node scripts/make-market-index.mjs --dry-run            # 只打印每个插件钉在哪个 commit
 *
 * 可选参数：
 *   --include-unreleased  收录没有发布 tag 的插件（兜底用 --commit/HEAD，不推荐长期使用）
 *   --commit <sha>        仅 --include-unreleased 时的兜底提交（默认 git rev-parse HEAD）
 *   --engines-dsh <range> 默认 ">=0.2.1-rc.5"
 *   --timestamp <unix秒>   仅无 tag 插件/取不到 tag 时间时的兜底时间，默认当前时间
 *   --category <id>       默认 productivity
 *   --index-title-en/--index-title-zh
 *   --out <path>          默认 docs/market-index.json
 *   --dry-run             只打印，不写文件
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);

function fail(message) {
  console.error('[make-market-index] ' + message);
  process.exit(1);
}
function argValue(name) {
  const at = argv.indexOf('--' + name);
  if (at === -1) return undefined;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith('--')) fail('--' + name + ' 缺少取值');
  return value;
}
const dryRun = argv.includes('--dry-run');
// 默认只收录「有发布 tag」的插件：<插件目录名>-v<版本>。这样重生成索引时，
// 已发布插件钉死在自己的 tag 上，正文一字不变，发布 A 不会顺带"发布" B。
// 加 --include-unreleased 才会把没有 tag 的插件也收进去（指向 --commit/HEAD）。
const includeUnreleased = argv.includes('--include-unreleased');
const repoConfig = (() => {
  try { return JSON.parse(readFileSync(join(root, 'repo.config.json'), 'utf8')); } catch { return {}; }
})();

// ---------------------------------------------------------------- 通用校验规则
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;
const NUMERIC = '(?:0|[1-9]\\d*)';
const PRERELEASE = '(?:' + NUMERIC + '|\\d*[a-zA-Z-][0-9a-zA-Z-]*)';
const SEMVER = new RegExp(
  '^' + NUMERIC + '\\.' + NUMERIC + '\\.' + NUMERIC +
  '(?:-' + PRERELEASE + '(?:\\.' + PRERELEASE + ')*)?' +
  '(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?$', 'u');

let gitUrl = argValue('git-url');
if (gitUrl === undefined) gitUrl = repoConfig.gitUrl;
if (typeof gitUrl !== 'string' || gitUrl === '') {
  fail('需要 --git-url（或在 repo.config.json 中配置 gitUrl）');
}
let parsedUrl;
try { parsedUrl = new URL(gitUrl); } catch { fail('--git-url 不是合法 URL: ' + gitUrl); }
if (parsedUrl.protocol !== 'https:') fail('--git-url 必须是 https:');
if (parsedUrl.pathname.split('/').filter(Boolean).length < 2) {
  fail('--git-url 需要 host 后至少两段路径，例如 https://github.com/user/repo');
}
const repoUrl = gitUrl.replace(/\.git$/u, '');

// 只有「未发布插件被 --include-unreleased 收录」时才用得到的兜底提交。
// 正常情况下每个插件都钉在自己的发布 tag 上，不需要 --commit。
let commit = argValue('commit');
if (commit !== undefined && !/^[0-9a-f]{40}$/u.test(commit)) fail('--commit 必须是 40 位小写十六进制: ' + commit);

const enginesDsh = argValue('engines-dsh') || '>=0.2.1-rc.5';
const timestamp = Number(argValue('timestamp') || Math.floor(Date.now() / 1000));
if (!Number.isInteger(timestamp) || timestamp >= 1e11) fail('publishTimestamp 非法: ' + timestamp);
const category = argValue('category') || 'productivity';
const outPath = resolve(root, argValue('out') || join('docs', 'market-index.json'));

function readMeta(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')).meta || {}; } catch { return {}; }
}
/** 解析 <tag>^{commit}，返回 40 位 SHA；tag 不存在返回 undefined。 */
function resolveTag(tag) {
  try {
    const sha = execFileSync('git', ['rev-parse', '--verify', '--quiet', tag + '^{commit}'],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
    return /^[0-9a-f]{40}$/u.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}
/** tag 指向提交的 committer 时间（unix 秒）；读不到返回 undefined。 */
function tagTime(sha) {
  try {
    const value = Number(execFileSync('git', ['log', '-1', '--format=%ct', sha],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim());
    return Number.isInteger(value) && value > 0 && value < 1e11 ? value : undefined;
  } catch {
    return undefined;
  }
}
/** 当前 HEAD 的 SHA（仅 --include-unreleased 兜底用）。 */
function headCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); }
  catch { fail('无法读取 git HEAD，请显式传 --commit <40位SHA>'); }
}
function iconOf(dir) {
  const iconPath = join(dir, 'icon.svg');
  if (!existsSync(iconPath)) return undefined;
  const bytes = readFileSync(iconPath);
  if (bytes.length > 32 * 1024) fail(dir + ' 的 icon.svg 超过 32 KiB，无法内嵌进索引');
  return 'data:image/svg+xml;base64,' + bytes.toString('base64');
}

// ---------------------------------------------------------------- 扫描插件
const pluginsDir = join(root, 'plugins');
if (!existsSync(pluginsDir)) fail('找不到 plugins 目录: ' + pluginsDir);

const plugins = [];
for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(pluginsDir, entry.name);
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.dsh || !pkg.dsh.bundle || typeof pkg.dsh.bundle.patch !== 'string') {
    console.log('[skip] ' + entry.name + '：没有 dsh.bundle.patch，不是 bundle');
    continue;
  }
  if (typeof pkg.name !== 'string' || !PACKAGE_NAME.test(pkg.name)) fail(entry.name + ' 的包名不合法: ' + pkg.name);
  if (typeof pkg.version !== 'string' || !SEMVER.test(pkg.version)) fail(entry.name + ' 的版本不是精确 SemVer: ' + pkg.version);

  // 该插件的发布 tag：<目录名>-v<package.json 版本>。
  const tag = entry.name + '-v' + pkg.version;
  const tagSha = resolveTag(tag);
  let pluginCommit = commit;
  let pluginTimestamp = timestamp;
  if (tagSha !== undefined) {
    // 已发布：钉死在自己的 tag 上，与本仓库 HEAD / 现在时间无关。
    // 这样任何时候重生成索引，已发布插件的条目都逐字不变。
    pluginCommit = tagSha;
    pluginTimestamp = tagTime(tagSha) ?? timestamp;
  } else if (!includeUnreleased) {
    console.log('[skip] ' + entry.name + '：没有发布 tag ' + tag + '，视为未发布，不收录' +
      '（要收录请打 tag，或加 --include-unreleased）');
    continue;
  } else {
    if (pluginCommit === undefined) pluginCommit = headCommit();
    console.log('[warn] ' + entry.name + '：没有发布 tag ' + tag + '，按 --include-unreleased 收录到 ' +
      pluginCommit.slice(0, 12) + '（未固定版本，不建议长期这样用）');
  }

  const metaZh = readMeta(join(dir, 'locale', 'zh.json'));
  const metaEn = readMeta(join(dir, 'locale', 'en.json'));
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author && pkg.author.name;
  plugins.push({
    name: pkg.name,
    title: { en: metaEn.title || pkg.name, zh: metaZh.title || pkg.name },
    description: {
      en: metaEn.description || pkg.description || pkg.name,
      zh: metaZh.description || pkg.description || pkg.name
    },
    ...(iconOf(dir) === undefined ? {} : { icon: iconOf(dir) }),
    ...(author === undefined ? {} : { author }),
    ...(pkg.homepage ? { homepage: pkg.homepage } : {}),
    repository: { url: repoUrl, directory: 'plugins/' + entry.name },
    metadata: {
      category,
      keywords: Array.isArray(pkg.keywords) ? pkg.keywords : [],
      labels: ['community'],
      sortKeys: { updated: pluginTimestamp }
    },
    versions: [
      {
        version: pkg.version,
        publishTimestamp: pluginTimestamp,
        source: { type: 'git', url: repoUrl, commit: pluginCommit, path: 'plugins/' + entry.name },
        engines: { dsh: enginesDsh }
      }
    ],
    _dir: entry.name
  });
}

if (plugins.length === 0) {
  fail('plugins/ 下没有已发布的 bundle。先给插件打 tag <目录名>-v<版本>，' +
    '或加 --include-unreleased 强制收录未发布插件。');
}

const index = {
  format: 1,
  title: {
    en: argValue('index-title-en') || (repoConfig.marketTitle && repoConfig.marketTitle.en) || 'DSH Plugin Market',
    zh: argValue('index-title-zh') || (repoConfig.marketTitle && repoConfig.marketTitle.zh) || 'DSH 插件市场'
  },
  description: {
    en: 'Plugin market index for DeepSeek Harness bundles.',
    zh: 'DeepSeek Harness 插件市场索引。'
  },
  metadata: {
    categories: { [category]: { title: { en: 'Productivity', zh: '效率工具' } } },
    labels: { community: { title: { en: 'Community', zh: '社区' } } },
    sortKeys: { updated: { title: { en: 'Recently updated', zh: '最近更新' }, order: 'desc' } }
  },
  plugins: plugins.map(({ _dir, ...plugin }) => plugin)
};

// 可选：官方校验器交叉验证（装了该包才生效）
try {
  const marketIndex = await import('@deepseek-ai/dsh-plugin-market-index');
  marketIndex.parseMarketIndex(index, 'https://example.invalid/market-index.json');
  console.log('[make-market-index] 已通过 @deepseek-ai/dsh-plugin-market-index 校验');
} catch (error) {
  if (error && error.name === 'MarketIndexError') fail('索引校验失败：' + error.message);
}

const text = JSON.stringify(index, null, 2) + '\n';
function report() {
  console.log('  插件数: ' + plugins.length);
  for (const [i, p] of plugins.entries()) {
    const v = p.versions[0];
    console.log(`  ${i + 1}. ${p.name}@${v.version}  path=plugins/${p._dir}`);
    console.log(`     commit ${v.source.commit}`);
    console.log(`     安装: git+${repoUrl}.git#${v.source.commit}&path:/plugins/${p._dir}`);
  }
}
if (dryRun) {
  console.log('[make-market-index] --dry-run，不写文件。');
  report();
  process.exit(0);
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, text, 'utf8');
console.log('[make-market-index] 已写入 ' + outPath);
report();
