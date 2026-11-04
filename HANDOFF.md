# HANDOFF · 交接文档

> 快照时间：2026-11-03 · 维护者：Mark930209 `<guimaxingtian@163.com>`
> 打开本目录后：先读本文 → 再读 [docs/plugin-dev-guide.md](docs/plugin-dev-guide.md)。

---

## 0. 一句话状态

多插件仓库 **GoDSH**（<https://github.com/Mark930209/GoDSH>）已完成 GitHub 化：
git 身份已设为 `Mark930209 / guimaxingtian@163.com`，`origin` 已指向该仓库并已推送；
新增 **CI 校验 / tag 发版 / Pages 部署** 三套工作流与 `scripts/release.mjs`、`scripts/validate-plugins.mjs`。
现有插件 `file-tree-context-menu` 与 `composer-skill-picker` **v1.0.0** 均已在 `desktop` profile 安装并启用（`link:` 指向本仓库）。
版本号已按用户要求重置为 1.0.0（旧 1.1.0 / 1.2.0 tag 与 Release 将清理），并新增：
复制 file:// / Markdown 链接、DSH 内预览、终端打开、AI 总结/解释、新建文件/文件夹、重命名、
删除到回收站、多选批量加入对话；同时移除「打开方式…」。**以后只有用户明确要求时才发版。**

**待人工验证**：重启 DeepSeek Harness 后，逐项检查 §4.1 的新菜单（尤其文件操作/回收站/终端/多选）。
GitHub Pages 已启用并部署成功，公开市场索引：`https://mark930209.github.io/GoDSH/market-index.json`。

**新增（2026-11-03）· 插件 `auto-retry` v1.0.0**：Host-only、无 UI 的失败恢复策略插件，
已 `install_bundle` 安装到 desktop profile（`application: applied`）。
模型请求失败按指数退避重试；整轮仍失败则延时自动续跑同一会话，直到任务完成或达到次数上限。
11 项行为测试通过（`node --test test/auto-retry.test.mjs`）；真实故障冒烟见 §4.3。

---

## 1. 环境事实（可直接照抄使用）

| 项 | 值 |
|---|---|
| 远程仓库 | `https://github.com/Mark930209/GoDSH`（`origin`，分支 `main`；fetch 走 HTTPS，push 走 SSH） |
| GitHub 认证 | SSH key `C:\Users\congzhisen\.ssh\github_guima`（`~/.ssh/config` 已配 `Host github.com`）；HTTPS PAT 存于 Windows 凭据管理器 |
| 本仓库 | `E:\Projects\DSH_Plugins_Dev` |
| git 身份（本仓库 local） | `Mark930209` / `guimaxingtian@163.com` |
| DSH 安装目录 | `E:\Users\congzhisen\AppData\Local\Programs\DeepSeek Harness` |
| DSH 实现 checkout | `…\resources\app.asar\dsh`（**asar 归档**：PowerShell 读不到内部，必须用 read 工具） |
| profile | `desktop`（`C:\Users\congzhisen\.dsh\profiles\desktop`） |
| 插件安装方式 | `link:E:/Projects/DSH_Plugins_Dev/plugins/<插件名>`（现有 file-tree-context-menu、composer-skill-picker、auto-retry） |
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
├─ plugins/file-tree-context-menu/   ← v1.0.0
│  client.js index.js package.json(1.0.0) cordis.patch.yml icon.svg
│  locale/{zh,en}.json README.md CHANGELOG.md LICENSE .gitignore .gitattributes
└─ plugins/composer-skill-picker/    ← v1.0.0（输入框工具行的项目技能下拉框）
│  client.js index.js package.json(1.0.0) cordis.patch.yml icon.svg
│  locale/{zh,en}.json README.md CHANGELOG.md LICENSE .gitignore .gitattributes
└─ plugins/auto-retry/               ← v1.0.0（Host-only，无 client.js）
   index.js package.json cordis.patch.yml icon.svg
   locale/{zh,en}.json README.md CHANGELOG.md LICENSE
   test/auto-retry.test.mjs
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
- [x] **GitHub Pages 已启用**（build type = GitHub Actions），`pages.yml` 部署成功；索引公开可访问
  `https://mark930209.github.io/GoDSH/market-index.json`（format 1，1 个插件）。
- [x] CI 首次跑通：`Validate plugins` 推送即成功；`Deploy market index` 手动 dispatch 成功。
- [x] **v1.2.0 菜单扩展**：复用核心 Session Remote `openWorkspacePath` / `workspacePathApplications`，
  新增「用默认应用打开、在文件夹中显示、用浏览器打开（html/svg 自动挑浏览器）、打开方式…（应用图标+默认标记）、复制名称」；
  纯 Web 部署自动隐藏本机打开分组。`node --check` 与 `validate-plugins.mjs` 通过。
- [x] **v1.2.0 已发布**：GitHub Release 创建成功，公开索引
  `https://mark930209.github.io/GoDSH/market-index.json` 已收录 1.2.0。
- [x] **release.yml 修复**：tag 提交可能落后 main，刷新索引改为先 `git checkout -B main origin/main`
  再生成并推送，避免 `HEAD:main` 非快进失败（v1.2.0 首次运行即在此步骤失败，已修复，后续发版正常）。
- [x] **v1.0.0 重发行**：版本重置为 1.0.0；新增复制 file:// / Markdown、DSH 预览、终端、AI 总结/解释、
  新建文件/文件夹、重命名、回收站删除、多选批量操作；移除「打开方式…」。Host 新增
  `POST /api/ftcm.fileops`（工作区根校验、新建/重命名/回收站/终端），已用临时目录跑通
  创建/重命名/重复/越权/回收站测试。旧 tag/Release 清理后按 1.0.0 重新发布。
- [x] **新插件 composer-skill-picker v1.0.0**（2026-11-03）：输入框工具行常驻「技能」下拉框
  （`conversation.input.left`，order 80，原生 `<select>`，样式对齐内置模型选择器）；
  自动发现当前项目的自定义技能（`project-dsh` = `.dsh/skills`、`project-agents` = `.agents/skills`），
  按名字排序；选中即插入 `/技能名 ` 并把焦点交还输入框。首版曾做成「按钮 + commandUi
  popupSelect 搜索弹窗」，按用户要求改为常驻下拉框后已重写。`node --check`、
  `validate-plugins.mjs` 通过，已 `install_bundle` 安装到 desktop profile（`fiberPhase: active`）。
- [x] **新插件 auto-retry v1.0.0**（2026-11-03）：Host-only 失败恢复策略插件，无 UI、不写自有会话事件。
  - 第 1 层 `agent/request-error`（waterfall）：失败模型请求按 `指数退避 + 抖动` 延后重试并返回
    `{ kind: 'retry' }`；同一步内不重新追加用户消息；尊重 `providerRetryAfterMs`；按 `turn:step`
    计数到 `maxRequestRetries`（默认 6）。
  - 第 2 层 `turn/end`（`reason.kind === 'error'`）：延时 `agent.followup()` 一条 `<auto_resume>`
    续跑提示，连续失败计数到 `maxConsecutiveResumes`（默认 5）；`completed`/`aborted`/`blocked`
    轮次清零预算。
  - 失败分类：5xx 与 408/409/425/429 可重试；`AUTH`/`API_KEY`/`QUOTA`/`INSUFFICIENT`/
    `CONTEXT_LENGTH`/`CONTENT_FILTER`/`NO_ADAPTER` 等不可重试 code **优先于状态码**判定
    （测试发现 429 + 额度类 code 会被误判为可重试，已修）。
  - 安全边界：`aborted`（用户停止）不续跑；`pauseOnUserInput` 下用户自己发消息取消待续跑；
    agent 忙碌/已销毁时跳过；插件卸载清空全部待发定时器。
  - 不 import 任何 `@deepseek-ai/*`：`inject = ['agents']`，续跑消息按 `createUserMessage` 的
    形状（`{id, role:'user', content, source}` + 深冻结）自行构造，避免跨 bundle 解析问题。
  - 测试：`test/auto-retry.test.mjs` 用假 Cordis 上下文重放真实事件负载，**11 项全部通过**。
  - 已 `install_bundle` → `application: applied`；`list_bundles` 显示 `installed/enabled: true`，
    `list_plugins` 行 `include:auto-retry` 为 **`fiberPhase: active`**（运行时已加载）。
  - **未发布**：用户 2026-11-03 明确「先安装，先都不发布」→ 未 bump、未打 tag、未建 Release、
    未刷新市场索引（索引仍只有 file-tree-context-menu 1.0.0）。发版需用户再次明确要求。
- [x] **发布机制改为「单插件独立发布」**（2026-11-04，用户质疑「为什么发一个必须全都发」）：
  - 根因：索引是全仓库一份 JSON，原脚本给**每个**插件写同一个 `commit`（默认 HEAD）和同一个
    时间戳（默认"现在"），于是重生成索引 = 把其他插件指向最新 HEAD、更新时间改成现在，
    等于把「已提交但未发布」的改动顺带发布。tag / Release 本身一直是分插件的，没问题。
  - 修法：`make-market-index.mjs` 改为**按 tag 钉版本**——只收录存在 tag
    `<插件目录名>-v<package.json 版本>` 的插件，`source.commit` 与 `updated` 都取自该 tag
    指向的提交；未打 tag 的插件默认跳过（`--include-unreleased` 才兜底收录）。
    实测：连续两次生成字节级一致（幂等）；临时打 `auto-retry-v1.0.0` 后索引只多出 auto-retry，
    `file-tree-context-menu` 条目一字未变，`composer-skill-picker`（无 tag）不出现。
  - `release.mjs` 新增 `tag-only` 模式（首次发布 1.0.0 不能走 patch，否则顶成 1.0.1），
    并修掉 tag-only 时"没有改动也可打 tag"的空提交报错。
  - `release.yml` 的索引刷新去掉 `--commit`（否则会把未发布插件指向 HEAD），改 `git fetch --tags`。
  - `docs/publishing.md` 补「索引是一份文件，但发布是各插件独立的」一节与 tag-only 用法。
  - 顺手把索引里 file-tree 的 `source.commit` 从 `47bbdca`（tag 前提交）纠正为 `3abb8bc`
    （= `file-tree-context-menu-v1.0.0` 指向的提交），时间戳同步为该提交时间。
- [x] **`validate-plugins.mjs` 修正**：`client.js` 改为**仅当 `dsh.client` 已声明时**才必需，
  使 Host-only bundle 能通过校验（此前硬性要求 client.js，auto-retry 首次校验即失败）。

## 4. 待办（按优先级）

1. **验证 v1.0.0**：完全退出 DSH 桌面端（含托盘）→ 重启 → 右键文件/文件夹检查：
   - 「加入对话」蓝色引用芯片；「用 AI 总结/解释」是否填入引用+提问；
   - 「复制 file:// 链接 / Markdown 链接」内容是否正确；「在 DSH 中预览」是否打开右侧预览；
   - 「在终端中打开」是否弹出 PowerShell 且位于目标目录；
   - 新建文件、新建文件夹、重命名、删除到回收站是否成功且文件树自动刷新；
   - Ctrl/Cmd 多选 + 右键「加入对话（N 项）」是否批量插入；普通单击是否清空选择；
   - 本机打开：默认应用 / 文件夹中显示 / HTML 用浏览器打开；
   - **不应**再出现「打开方式…」。
   任一项失败：DevTools 看 `[file-tree-context-menu]` 警告并反馈；修 bug 不自动发版。
2. **验证 composer-skill-picker**：重启 DSH → 在 `E:\5_8U\Cybertron` 的会话里看工具行「技能」下拉框
   是否列出 19 个项目技能（`.agents/skills/*`），选中是否插入 `/ec9-architect ` 且焦点回到输入框；
   在本仓库（无项目技能）应显示「当前项目没有技能」并禁用。
3. **验证 auto-retry（需要一次真实失败）**：重启 DSH 后，
   - 正常续跑：随便让 agent 跑一个多步任务，中途断网 / 拔 VPN 触发模型请求失败，
     观察是否在 2s、4s、8s… 后自动重试而不是直接报错结束；
   - 整轮失败：若失败不是模型请求（例如工具崩溃），应看到日志
     `[auto-retry] agent "...": turn failed (...); resume 1/5 scheduling in ...ms`，
     随后约 5s 后会话自动继续；
   - 用户干预：待续跑期间自己发一句话，应取消已排队的续跑；
   - 停止按钮：点停止不应触发任何续跑；
   - 日志前缀统一为 `[auto-retry]`（Host 侧 `ctx.logger`，桌面端 stderr / 日志面板）。
   若未观察到任何 `[auto-retry]` 日志：说明插件未激活或 root 监听收不到 agent 作用域事件，
   改用 `agent.ctx`（在 `agent/created` 里注册）的方案。
4. 计划下一个插件时：`node scripts\new-plugin.mjs <name>` → 开发 → `node scripts\validate-plugins.mjs --plugin <name>`。
5. 可选：如需把 GitHub 身份设为全局，执行
   `git config --global user.name "Mark930209"` 与 `git config --global user.email "guimaxingtian@163.com"`。

## 5. 常用命令

```powershell
cd E:\Projects\DSH_Plugins_Dev
node scripts\new-plugin.mjs dsh-xxx                              # 新插件（自动套 repo.config.json）
node scripts\validate-plugins.mjs [--plugin <name>] [--since origin/main]
node scripts\release.mjs <name> patch "变更摘要" [--push]         # 仅用户明确要求时发版
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
