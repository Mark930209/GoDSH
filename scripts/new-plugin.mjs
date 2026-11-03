#!/usr/bin/env node
/**
 * 从 templates/plugin-bundle 脚手架一个新插件：node scripts/new-plugin.mjs <name>
 *
 * <name> 用 kebab-case，建议 dsh- 前缀（如 dsh-file-preview）。
 * 生成到 plugins/<name>/，包名默认 @local/<name>（private，发布前再改正式名）。
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];

function fail(message) {
  console.error('[new-plugin] ' + message);
  process.exit(1);
}
if (typeof name !== 'string' || name === '') fail('用法: node scripts/new-plugin.mjs <name>（kebab-case）');
if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(name)) fail('name 必须是 kebab-case，如 dsh-file-preview');

const template = join(root, 'templates', 'plugin-bundle');
const target = join(root, 'plugins', name);
if (!existsSync(template)) fail('模板缺失: ' + template);
if (existsSync(target)) fail('目标已存在: ' + target);

cpSync(template, target, { recursive: true });

// 包名
const pkgPath = join(target, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.name = '@local/' + name;
pkg.version = '0.1.0';
pkg.repository = { type: 'git', url: 'https://github.com/congzhisen/dsh-plugins.git', directory: 'plugins/' + name };
pkg.homepage = 'https://github.com/congzhisen/dsh-plugins/tree/main/plugins/' + name;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// 替换占位符 __PLUGIN__
for (const file of ['client.js', 'cordis.patch.yml', 'README.md']) {
  const path = join(target, file);
  if (!existsSync(path)) continue;
  writeFileSync(path, readFileSync(path, 'utf8').split('__PLUGIN__').join(name), 'utf8');
}

// 插件 id 中的点号替换（cordis id 用 kebab 即可，保持 name）

console.log('[new-plugin] 已生成 ' + target);
console.log('下一步：');
console.log('  1. 编辑 ' + join(target, 'client.js'));
console.log('  2. node --check "' + join(target, 'client.js') + '"');
console.log('  3. 安装：plugin_manager install_bundle target=' + target);
console.log('  4. 重启 DeepSeek Harness 验证；别忘了更新 CHANGELOG.md 与仓库 README');
