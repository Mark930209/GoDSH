# 仓库组织：为什么用 monorepo（多插件单仓库）

## 你的疑问：一个插件一个 git 仓库，是不是太浪费？

**结论：不是「错」，但多数情况下没必要；本仓库选择 monorepo（单仓库、多插件目录）。**

| 维度 | 一插件一仓库（multi-repo） | 本仓库：monorepo |
|---|---|---|
| 仓库/权限管理 | 每个插件单独建、单独授权，插件多了很碎 | 一个仓库一次搞定 |
| 共享代码/脚本/文档 | 复制粘贴或再建一个包 | `scripts/`、`docs/`、`templates/` 直接共享 |
| 版本与发布 | 天然独立 | 目录独立，靠 **tag 前缀** 区分（`<plugin>-vX.Y.Z`） |
| 安装到 DSH | `git+…/repo.git#<commit>` | `git+…/repo.git#<commit>&path:/plugins/<name>`（规格支持 `path`） |
| 市场索引 | 每仓库一个索引 | **一个索引列全部插件**（每个 version 的 git 源带 `path`） |
| CI | 每仓库独立 | 可只跑「改动目录」相关检查 |
| 缺点 | 少量插件时开销大；共享成本高 | 仓库随插件增多变大；需约定 tag 规范 |

### 为什么 monorepo 对本仓库合适

1. **插件之间高度同构**（都是 bundle：`package.json` + `cordis.patch.yml` + `client.js`），模板与脚本可共享。
2. 你要「打开一个文件夹就接续工作」，monorepo 让所有插件与文档在一个工作区里，符合这个目标。
3. DSH 的安装规格与市场索引**原生支持 `path` 子目录**，monorepo 不牺牲按插件安装/发布的能力。
4. 每个插件仍是**独立 npm 包**（独立 `name`/`version`），发布时互不影响。

### 什么时候再拆出去

- 某个插件要独立开源 / 独立维护者 / 不同 License / 需要独立 Issue 与 Release 流程；
- 或者仓库大到克隆/CI 明显变慢。
拆出时：把 `plugins/<name>` 提升为独立仓库根即可（保留目录结构），再改 tag 与索引。

## 命名与版本规范

- 插件目录名：`dsh-<功能>`（kebab-case），**同时就是 npm 包名**（无作用域，可直接发布）。
- 历史上用过 `@local/<目录名>` + `private: true` 的本地写法；2026-11-04 起统一改成裸名 `dsh-*`
  并移除 `private`，`npm publish` 即可上线（改名后本机需 `remove_bundle` 旧名再装）。
- 版本：每插件独立 semver；`package.json#version` 是唯一事实源。
- **tag：`<插件目录名>-v<version>`**，例如 `dsh-file-tree-v1.1.0`（改名前的旧 tag `file-tree-context-menu-v1.0.1` 仍存在）。
  （用 `npm version` 默认生成 `v1.1.0`，在 monorepo 里请补一个带前缀的 tag，或直接用 `git tag <name>-v<ver>`。）

## 索引与安装的对应关系

三条安装渠道（详见 [install.md](install.md)）：

| 渠道 | 规格 |
|---|---|
| npm | `dsh-<功能>`（或 `dsh-<功能>@<版本>`） |
| git | `git+https://github.com/Mark930209/GoDSH.git#<commit>&path:/plugins/<name>` |
| 市场索引 | 添加 `https://mark930209.github.io/GoDSH/market-index.json` |

- 市场索引里每个版本：
  ```json
  { "version": "1.1.1",
    "source": { "type": "git", "url": "https://github.com/Mark930209/GoDSH",
                "commit": "<40位>", "path": "plugins/dsh-file-tree" },
    "engines": { "dsh": ">=0.2.1-rc.5" } }
  ```
- 索引由 `node scripts/make-market-index.mjs` 自动扫描 `plugins/*` 生成，
  只收录**存在对应 tag** 的插件（按 tag 钉 commit，见 [publishing.md](publishing.md)）。

## 事故复盘：2026-11-03 误删插件源文件

- **触发**：跨盘 `Move-Item` 在删除旧 `.git` 失败后中断，此时根文件已被搬到目标目录；
  随后把「半成品目标目录」当残留清理，删掉了唯一副本。
- **恢复**：会话日志（多帧 zstd，逐帧解压）+ Cybertron 旧提交 `.agents/dsh-plugins/`，回放 49 个操作重建，0 失败。
- **纪律**（已写入 `AGENTS.md`）：
  1. **改完就 `git commit`**，不积累未提交改动；
  2. 对「唯一副本」不要做「移动 + 清理」的组合操作，先复制、验证、再删源；
  3. 迁移类操作先 `git status` 确认干净、再执行。
