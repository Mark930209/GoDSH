# HANDOFF · 交接文档

> 快照时间：2026-11-03 · 维护者：Mark930209 `<guimaxingtian@163.com>`
> 打开本目录后：先读本文 → 再读 [docs/plugin-dev-guide.md](docs/plugin-dev-guide.md)。

---

## 0. 一句话状态

多插件仓库 **GoDSH**（<https://github.com/Mark930209/GoDSH>）已完成 GitHub 化：
git 身份已设为 `Mark930209 / guimaxingtian@163.com`，`origin` 已指向该仓库并已推送；
新增 **CI 校验 / tag 发版 / Pages 部署** 三套工作流与 `scripts/release.mjs`、`scripts/validate-plugins.mjs`。
现有插件 `file-tree-context-menu` **v1.1.0** 已在 `desktop` profile 安装并启用（`link:` 指向本仓库）。

**唯一待人工验证**：重启 DeepSeek Harness 后，右键「加入对话」是否出现**蓝色引用芯片**（见 §4.1）。
**首次需人工开启 GitHub Pages**（Settings → Pages → Source: GitHub Actions），见 §4.2。

---

## 1. 环境事实（可直接照抄使用）

| 项 | 值 |
|---|---|
| 远程仓库 | `https://github.com/Mark930209/GoDSH`（`origin`，分支 `main`） |
| 本仓库 | `E:\Projects\DSH_Plugins_Dev` |
| git 身份（本仓库 local） | `Mark930209` / `guimaxingtian@163.com` |
| DSH 安装目录 | `E:\Users\congzhisen\AppData\Local\Programs\DeepSeek Harness` |
| DSH 实现 checkout | `…\resources\app.asar\dsh`（**asar 归档**：PowerShell 读不到内部，必须用 read 工具） |
| profile | `desktop`（`C:\Users\congzhisen\.dsh\profiles\desktop`） |
| 插件安装方式 | `link:E:/Projects/DSH_Plugins_Dev/plugins/file-tree-context-menu` |
| Node / Git | v24.15.0 / 2.46.0 |
| 验证基线 | DSH `0.2.1-rc.5`，Windows 桌面端 |

## 2. 目录与已就位内容

```
GoDSH/
├─ AGENTS.md  README.md  HANDOFF.md  CONTRIBUTING.md  LICENSE
├─ repo.config.json                仓库元数据（脚本共用）
├─ .github/ workflows(validate|release|pages).yml + pull_request_template.md
├─ docs/ (repo-layout.md, plugin-dev-guide.md, publishing.md, maintenance.md,
│         market-index.json, examples/)
├─ scripts/ (validate-plugins.mjs, new-plugin.mjs, release.mjs, make-market-index.mjs)
├─ templates/plugin-bundle/ (最小可运行模板)
└─ plugins/file-tree-context-menu/   ← v1.1.0
   client.js(511行) index.js package.json(1.1.0) cordis.patch.yml icon.svg
   locale/{zh,en}.json README.md CHANGELOG.md LICENSE .gitignore .gitattributes
```

## 3. 已完成

- [x] **git 身份**：本仓库 `user.name=Mark930209`、`user.email=guimaxingtian@163.com`（全局未改，避免影响其他仓库）。
- [x] **GitHub 化**：`origin` = GoDSH；`main` 与 tag `file-tree-context-menu-v1.1.0` 已推送。
- [x] **占位地址全量替换**：`package.json` 的 `homepage`/`repository`/`author`、脚本、文档、索引示例统一为 Mark930209/GoDSH。
- [x] **多插件工作流**：
  - `.github/workflows/validate.yml` —— PR 只校验改动插件；main 全量校验。
  - `.github/workflows/release.yml` —— 推 `<name>-v<ver>` tag：校验 + 版本一致性检查 + GitHub Release + 自动刷新索引回推 main。
  - `.github/workflows/pages.yml` —— `docs/` 变更时部署 GitHub Pages（托管市场索引）。
  - `scripts/validate-plugins.mjs`（支持 `--since` / `--plugin` / `--json`）、`scripts/release.mjs`（bump→提交→tag→索引→推送）。
  - `repo.config.json` 作为单一配置源，`new-plugin` / `make-market-index` 自动读取。
- [x] **右键菜单插件启用**：desktop profile 的 `bundles` 含 `@local/file-tree-context-menu`，
  `node_modules/@local/file-tree-context-menu` 为符号链接 → 本仓库插件目录；`node --check` 通过。
- [x] 市场索引已按新仓库重新生成（`docs/market-index.json`）。

## 4. 待办（按优先级）

1. **验证芯片**：完全退出 DSH 桌面端（含托盘）→ 重启 → 右键文件「加入对话」。
   出蓝色芯片 = 通过；出「已插入文本（非芯片）」或「操作失败」= 打开 DevTools 看 `[file-tree-context-menu]` 警告并反馈。
2. **开启 GitHub Pages**（首次一次性）：Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。
   之后索引地址 = `https://mark930209.github.io/GoDSH/market-index.json`（Pages 主机名是小写用户名）。
3. 计划下一个插件时：`node scripts\new-plugin.mjs <name>` → 开发 → `node scripts\validate-plugins.mjs --plugin <name>`。
4. 可选：如需把 GitHub 身份设为全局，执行
   `git config --global user.name "Mark930209"` 与 `git config --global user.email "guimaxingtian@163.com"`。

## 5. 常用命令

```powershell
cd E:\Projects\DSH_Plugins_Dev
node scripts\new-plugin.mjs dsh-xxx                              # 新插件（自动套 repo.config.json）
node scripts\validate-plugins.mjs [--plugin <name>] [--since origin/main]
node scripts\release.mjs <name> patch "变更摘要" [--push]         # 发版（bump→tag→索引→推送）
node scripts\make-market-index.mjs                               # 手动刷新索引
# 安装（让 agent 执行）: plugin_manager install_bundle target=<插件绝对路径>
# 重启 DeepSeek Harness（托盘退出再开）验证
git push origin HEAD --follow-tags
```

## 6. 恢复记录（2026-11-03 误删事故）

**经过**：迁移时一次 `Move-Item` 把插件根文件搬进了目标目录、但删除旧 `.git` 失败而中断；
随后我把那个「半成品目标目录」当成残留清理，**误删了当时唯一的源码副本**。

**恢复来源**：
1. Cybertron 仓库历史提交 `a96324ea82` 中 `.agents/dsh-plugins/file-tree-context-menu/` 的早期副本（v1.0 基线）；
2. 会话日志 `C:\Users\congzhisen\.dsh\sessions\--E-5_8U-Cybertron--\<session>\session.v4.jsonl.zstd`
   —— **多帧 zstd**（Node `zstdDecompressSync` 只解第一帧，需按魔数 `28 B5 2F FD` 切帧逐帧解压）；
   从日志回放 **49 个 write/edit 操作，0 失败**，重建全部文件。
3. 幸存的 `locale/*.json`、`docs/market-index.json`、`scripts/make-market-index.mjs` 直接用磁盘原件（未覆盖）。

**验证**：`node --check` 通过；`client.js` 511 行，4 个菜单项、3 个插槽、芯片+回退逻辑齐全；package.json 为 1.1.0。

**教训（已写入 AGENTS.md）**：改完就提交；不要用「移动+清理」组合操作处理唯一副本；
在 asar 环境中 PowerShell 与 Node 对归档内路径不可见，只有 DSH 的 read 工具能读。

## 7. 接续清单（给下一个会话/同事）

1. 以本目录为 DSH 工作区打开（`AGENTS.md` 自动加载）。
2. 读 `docs/plugin-dev-guide.md` 了解 bundle 结构、slot、事件与坑。
3. 按 `docs/maintenance.md` / `CONTRIBUTING.md` 的循环开发 → 验证 → 提交 → 发版。
4. 收尾更新本文件第 3/4 节的勾选与状态。
