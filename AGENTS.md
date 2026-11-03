# 工作区指令：DSH 插件开发（monorepo）

本目录是 DeepSeek Harness 自研插件的开发仓库。**在此工作区内作业时遵守以下规则。**

## 结构

- 每个插件是 `plugins/<name>/` 下的独立 npm 包（bundle）。
- 插件源码**只放这里**，不要放进业务仓库或 DSH 安装目录（安装目录只作为部署目标，由 `install_bundle` 建立 `link:`）。
- 共享工具在 `scripts/`，模板在 `templates/plugin-bundle/`，仓库元数据在 `repo.config.json`（git 地址/作者/默认分支/市场标题，脚本共用）。

## 安装与生效

- 安装：`plugin_manager install_bundle`，`target` 传 `plugins/<name>` 的**绝对路径**。
- 只改 `client.js` / `locale` / 文档 → **重启 DeepSeek Harness** 即生效。
- 改了 `package.json` 的 `name`/依赖 → 先 `remove_bundle` 再 `install_bundle`。
- 移动插件目录后：先 `remove_bundle`（旧名），再按新路径 `install_bundle`。

## 开发流程（必须）

1. 小步改 → `node --check client.js`（及 JSON 解析）→ 重启冒烟。
2. 更新该插件的 `CHANGELOG.md`。
3. 发版：仓库根执行 `node scripts\release.mjs <name> patch|minor|major "摘要" [--push]`
   （自动 bump、提交、打 `<name>-vX.Y.Z` tag、刷新市场索引；推 tag 后 CI 自动建 Release 并回写索引）。
4. `git commit` 要勤——**不要积累未提交的改动**（本仓库发生过误删事故，教训见 docs/repo-layout.md）。
5. 发布/索引/CI：`docs/publishing.md`、`CONTRIBUTING.md`；版本与回滚：`docs/maintenance.md`。

## Git / 远程

- 远程：`origin` = `https://github.com/Mark930209/GoDSH`（push 走 SSH `github_guima`）。
- 本仓库 git 身份：`Mark930209 <guimaxingtian@163.com>`（local 配置）。
- 校验：`node scripts\validate-plugins.mjs [--plugin <name>] [--since origin/main]`。

## 禁止

- 禁止把 `node_modules`、日志、`.recovery` 提交进仓库。
- 禁止在未 `node --check` 的情况下提交 JS。
- 禁止直接改 DSH 安装目录内的插件副本（那是 link 的部署副本，唯一事实源是本仓库）。

## 收尾

每次阶段收尾更新 `HANDOFF.md` 的「已完成 / 待办 / 环境事实」，保证下一个会话打开本目录即可接续。
