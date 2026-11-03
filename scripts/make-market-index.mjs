#!/usr/bin/env node
/**
 * 聚合生成 format 1 插件市场索引（默认 docs/market-index.json）。
 *
 * 扫描 plugins/<name>/package.json（要求带 dsh.bundle.patch），每个插件生成一条记录，
 * git 源自动带 path: plugins/<name>，因此 monorepo 也能按插件独立安装。
 *
 * 用法：
 *   node scripts/make-market-index.mjs            # 默认读 repo.config.json
 *   node scripts/make-market-index.mjs --git-url ... --commit <40位SHA> --dry-run
 *
 * 可选参数：
 *   --commit <sha>        默认 git rev-parse HEAD
 *   --engines-dsh <range> 默认 ">=0.2.1-rc.5"
 *   --timestamp <unix秒>  默认当前时间
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

let commit = argValue('commit');
if (commit === undefined) {
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); }
  catch { fail('无法读取 git HEAD，请显式传 --commit <40位SHA>'); }
}
if (!/^[0-9a-f]{40}$/u.test(commit)) fail('commit 必须是 40 位小写十六进制: ' + commit);

const enginesDsh = argValue('engines-dsh') || '>=0.2.1-rc.5';
const timestamp = Number(argValue('timestamp') || Math.floor(Date.now() / 1000));
if (!Number.isInteger(timestamp) || timestamp >= 1e11) fail('publishTimestamp 非法: ' + timestamp);
const category = argValue('category') || 'productivity';
const outPath = resolve(root, argValue('out') || join('docs', 'market-index.json'));

function readMeta(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')).meta || {}; } catch { return {}; }
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
      sortKeys: { updated: timestamp }
    },
    versions: [
      {
        version: pkg.version,
        publishTimestamp: timestamp,
        source: { type: 'git', url: repoUrl, commit, path: 'plugins/' + entry.name },
        engines: { dsh: enginesDsh }
      }
    ],
    _dir: entry.name
  });
}

if (plugins.length === 0) fail('plugins/ 下没有找到任何 bundle');

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
if (dryRun) {
  console.log('[make-market-index] --dry-run，不写文件。插件数：' + plugins.length);
  console.log(text.slice(0, 1200));
  process.exit(0);
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, text, 'utf8');
console.log('[make-market-index] 已写入 ' + outPath);
console.log('  commit  : ' + commit);
for (const [i, p] of plugins.entries()) {
  console.log(`  ${i + 1}. ${p.name}@${p.versions[0].version}  path=plugins/${p._dir}`);
  console.log(`     安装: git+${repoUrl}.git#${commit}&path:/plugins/${p._dir}`);
}
