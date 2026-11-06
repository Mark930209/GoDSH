# 当前状态（快照 2026-11-06）

> 新会话进本仓库时，读这一页 + [plugin-dev-guide.md](plugin-dev-guide.md) 即可接续。
> 安装见 [install.md](install.md)，发版见 [publishing.md](publishing.md)。

## 一句话状态

三个插件（`auto-retry` / `composer-skill-picker` / `dsh-file-tree`）都已发布，**三条分发渠道**同时在线：
git tag + GitHub Release、公共 npm、GitHub Pages 市场索引。
本机 desktop profile 以 `link:` 装在源码目录，三个条目均为 `fiberPhase: active`。

> **2026-11-06 已发版**：`file-tree-context-menu` 改名为 **`dsh-file-tree`**，
> 并加入 Git 改动着色 / 字母徽标 / 页头分支胶囊（含未推送提交数）。版本 **1.1.0**，
> tag `dsh-file-tree-v1.1.0`（`22a14a1`）、GitHub Release、市场索引均已就绪；
> **npm 因包名与 `dsh-filetree` 相似被拒，尚未发布**。
> 旧包 `dsh-file-tree-context-menu@1.0.1` 保留但不再更新；npm 名带作用域
> （`@guimaxingtian/dsh-file-tree`）是因为裸名与第三方包 `dsh-filetree` 过于相似。
`n1n-prompt-tools` 已于 2026-11-06 **整体废弃删除**（从未发版，无 tag / 无 npm 包 / 不在
市场索引）；它沉淀的缓存与协议知识保留在 `docs/prompt-cache-investigation.md`、
`docs/dsh-conversation-internals.md`、`docs/text-tool-protocol.md`。

## 知识文档（跨插件复用，勿删）

| 文档 | 内容 |
|---|---|
| [prompt-cache-investigation.md](prompt-cache-investigation.md) | 前缀缓存命中率调查全记录：口径、9 组实验、网关行为备忘、公司操作建议、测量陷阱、脚本索引 |
| [dsh-conversation-internals.md](dsh-conversation-internals.md) | DSH 会话层事实：v4 日志 zstd 帧格式与修复、事件字典、时间提醒不破前缀、水位钩子能/不能拿到什么、配置凭据位置 |
| [text-tool-protocol.md](text-tool-protocol.md) | 文本工具调用协议：4 种方言与全角 DSML、解析要点、"提到协议≠尝试调用"、自动降级四原则、实测模型行为 |

## 插件状态

| 目录 | npm 包名 | 版本 | tag（commit） | 本机安装 |
|---|---|---|---|---|
| `plugins/auto-retry` | `dsh-auto-retry` | 1.0.2 | `auto-retry-v1.0.2`（`12a89aa`） | link，active |
| `plugins/composer-skill-picker` | `dsh-composer-skill-picker` | 1.0.1 | `composer-skill-picker-v1.0.1`（`e30c3b2`） | link，active |
| `plugins/dsh-file-tree` | `@guimaxingtian/dsh-file-tree`（旧名 `dsh-file-tree-context-menu`） | 1.1.1 | `dsh-file-tree-v1.1.1`（`79a80bd`） | link，active（待重启换名） |

- 公共 npm：`dsh-auto-retry` `1.0.2`、`dsh-composer-skill-picker` `1.0.1`、
  `@guimaxingtian/dsh-file-tree` `1.1.1`（裸名 `dsh-file-tree` 被 npm 判为与第三方包
  `dsh-filetree` 过于相似而拒收，故改用作用域包名）。旧包 `dsh-file-tree-context-menu`
  停在 `1.0.1`，不再更新。
  npm 包页同时残留一个 `0.0.0-stage` 占位版本（staged publishing 产物，见
  [publishing.md](publishing.md#账号层面的两个坑已踩过)），不影响安装。
- 市场索引：<https://mark930209.github.io/GoDSH/market-index.json>（3 条：auto-retry 1.0.2、
  composer-skill-picker 1.0.1、dsh-file-tree 1.1.0）。
- 旧 tag `*-v1.0.0` 与对应 Release 保留为历史，索引只列当前 `package.json` 版本。

## 环境事实

| 项 | 值 |
|---|---|
| 远程仓库 | `https://github.com/Mark930209/GoDSH`（`origin`，分支 `main`；fetch 走 HTTPS，push 走 SSH） |
| GitHub 认证 | SSH key `C:\Users\congzhisen\.ssh\github_guima`（`~/.ssh/config` 已配 `Host github.com`）；HTTPS PAT 存于 Windows 凭据管理器 |
| 本仓库 | `E:\Projects\DSH_Plugins_Dev` |
| git 身份（本仓库 local） | `Mark930209` / `guimaxingtian@163.com` |
| DSH 安装目录 | `E:\Users\congzhisen\AppData\Local\Programs\DeepSeek Harness` |
| DSH 实现 checkout | `…\resources\app.asar\dsh`（**asar 归档**：PowerShell 读不到内部，只能用 DSH 的 read 工具/grep） |
| profile | `desktop`（`C:\Users\congzhisen\.dsh\profiles\desktop`） |
| 插件安装方式 | `link:E:/Projects/DSH_Plugins_Dev/plugins/<目录名>` |
| 外部（同事）插件 | `dsh-llm-text-tools` → 源码 `E:\Projects\DSH_Plugins_Ext\dsh-llm-text-tools`，`link:` 装进 desktop profile；**带运行时依赖的 link 插件必须在该目录跑过一次 `pnpm install`**（Node 按真实路径解析依赖） |
| npm 账号 / token | `guimaxingtian`，`~/.npmrc` 存 `//registry.npmjs.org/:_authToken`（Classic → Automation）；本机默认 registry 是内网镜像 `http://10.66.12.81:4873/`，发布必须显式 `--registry=https://registry.npmjs.org/` |
| Node / Git / npm | v24.15.0 / 2.46.0 / 11.12.1 |
| RTK（Rust Token Killer） | `0.45.0`，`C:\Users\congzhisen\.local\bin\rtk.exe`；**未给 DSH 装 hook**（`rtk init` 无 DSH 目标） |
| 验证基线 | DSH `0.2.1-rc.5`，Windows 桌面端 |

## 已完成（时间线）

- **2026-11-06 · `dsh-file-tree` 1.1.0 发布**（用户明确要求发版）。
  - 版本 1.0.1 → **1.1.0**（minor：改名 + Git 视图属于新增能力），tag `dsh-file-tree-v1.1.0`
    指向 `22a14a1`，随后的索引提交为 `4c0812e`；GitHub Release 已由 CI 建好。
  - **npm 403 → 改用作用域**：`npm publish dsh-file-tree` 返回「Package name too similar to
    existing package `dsh-filetree`」。于是发 **1.1.1**：包名改为 `@guimaxingtian/dsh-file-tree`
    （加 `publishConfig.access=public`），tag `dsh-file-tree-v1.1.1`，npm 与索引随之更新。
  - **1.1.0 没有 npm 版本**：那次的 tag / Release / 索引条目保留，但 npm 上不存在 1.1.0。
  - **1.1.1 发布结果**：`npm publish` 返回 `+ @guimaxingtian/dsh-file-tree@1.1.1`，
    tarball 已可下载（32 KB）；registry 的 packument 仍在处理中（`npm view` 暂时 404），
    过几分钟会自动可见，无需重发。
  - **CI 已知问题（已在 1.1.1 修复）**：`Release plugin` 的「Refresh market index」步骤自
    2026-11-04 起每次都失败。推断原因是 `actions/checkout` 检出 tag 时只配了窄 refspec，
    `git fetch origin main --tags` 不会生成 `refs/remotes/origin/main`，于是
    `git checkout -B main origin/main` 直接退出 1。修法：改成显式 refspec
    `+refs/heads/main:refs/remotes/origin/main`，并把每个可能失败的命令包成 `::error::` 注解
    （job 日志要鉴权，注解公开可读，红叉能自带原因）。1.1.1 的 run 已 **success**。
  - **profile 同步改名**：`dsh.profile.bundles` 与依赖键改成 `@guimaxingtian/dsh-file-tree`，
    junction 指到同一源码目录；`pnpm-lock.yaml` importer 同步。`require.resolve` 实测可解析。
  - `docs/market-index.json` 已刷新：条目从旧名 `dsh-file-tree-context-menu@1.0.1`
    变为 `dsh-file-tree@1.1.0`（旧目录已改名，索引不再收录旧条目，但 npm 旧包仍可安装）。
  - 推 `main` + tag 后由 `release.yml` 建 GitHub Release 并二次刷新索引，`pages.yml` 部署 Pages。
  - 本次同时把 `auto-retry` 的文档版本对齐到实际的 `1.0.2`（`auto-retry-v1.0.2`）。
  - 新增能力见 [../plugins/dsh-file-tree/CHANGELOG.md](../plugins/dsh-file-tree/CHANGELOG.md)。

- **2026-11-06 · `dsh-file-tree` 二次打磨：定位改「文件树增强」+ 未推送可见**。
  - **定位**：市场标题从「文件树右键菜单 / File Tree Context Menu」改为
    「文件树增强 / File Tree Enhancements」，说明改成以文件树 Git 视图为主、右键菜单为辅。
  - **未推送状态**：文件页头注册 `sidebar.right.tab.files.actions` 槽位（独立 slot id
    `dsh-file-tree.sync`），渲染分支胶囊：`↑N` 橙=本地有提交未推送、`↓N` 蓝=远程有未拉取、
    `✓`=已同步、`◎`=无上游分支；点击强制刷新，右键打开该工作区 Git 菜单。
  - **数据来源**：仍是一次 `git status --porcelain=v2 --branch --ahead-behind`；Host 快照新增
    `hasUpstream`/`upstream`，用来区分「已同步」和「从未 push 过」——后者绝不能显示成 ✓。
  - **验证**：Host 路由测试新增 push 到 bare 远程（ahead=1）、`--unset-upstream`（hasUpstream=false）
    两段；Client 测试覆盖 synced/unpushed/behind/diverged/local/detached 六种语义与胶囊渲染。
  - 该轮改动随后作为 **1.1.0** 发布（见上一条）。

- **2026-11-06 · 安装同事的第三方插件 `dsh-llm-text-tools`（内网 git）**。用户给的是
  `http://git.51vr.local/xuyifei/dsh-llm-text-tools`（本人仓库，0.2.0，HEAD `b53c892`）。
  - **放哪**：克隆到 **`E:\Projects\DSH_Plugins_Ext\dsh-llm-text-tools`**。同事的包不进本仓库、
    也不进 `plugins/`（那里只放自研插件，混进去会被当成自家包发版）。
  - **怎么装**：本会话 **没有 `plugin_manager` 工具**，改为手工复刻 `install_bundle`：
    `profiles\desktop\package.json` 的 `dsh.profile.bundles` 加 `dsh-llm-text-tools`、
    `dependencies` 加 `link:E:/Projects/DSH_Plugins_Ext/dsh-llm-text-tools`，再在 profile 目录
    `pnpm install`。改前备份 `package.json.bak-20261106-install-llm-text-tools`。
  - **踩到的坑（新知识）**：`link:` 是指向真目录的符号链接，Node 按**真实路径**解析 bare import，
    插件目录没有自己的 `node_modules` 时 `@deepseek-ai/schemastery` 直接
    `ERR_MODULE_NOT_FOUND`。本仓库三个插件没有运行时依赖，所以以前没暴露。修法：在插件目录里跑
    一次 `pnpm install`（装上 `@deepseek-ai/schemastery` 3.19.0 + `@deepseek-ai/cordis` 4.0.5）。
    **今后装任何带依赖的第三方 link 插件都要做这一步**，否则重启时插件加载失败。
  - **验证（重启前能做的都做了）**：插件自带 `node --check` 与 62 项单元测试全绿；
    `createRequire(profile/package.json).resolve()` + `import()` 实测加载成功、`apply()` 正常注册
    `n1n-text` 路由；另用临时 profile（复制 desktop 的 `package.json`/`cordis.patch.yml` + junction
    `node_modules`）跑 `dsh --profile <tmp> --dump-config`，确认合成结果里出现
    `id: llm-text-tools` / `provider: n1n-text` 且位置正确（验证完已删除临时 profile 与 junction）。
  - **生效方式**：bundle 自带 patch 会插入**一条新路由** `n1n-text`（`https://llm-api.net/v1`，
    模型 `deepseek-v4.1-flash` / `deepseek-v4-pro`，`reasoningEffort: high`，凭据 `N1N_API_KEY`），
    与原 `n1n` 路由并存；默认模型仍是 `n1n / deepseek-v4.1-flash`，不切换过去就没有行为变化。
    要调参（如 `contextWindow`）在 profile `cordis.patch.yml` 里按 `id: llm-text-tools` 覆盖。
  - [ ] **待用户重启 [DSH]** 后确认：模型选择器出现 `n1n-text` 路由、Plugins 页该行 `active`、
        `deepseek-v4.1-flash` 回一句正常回答（注意 `maxTokens: 384000` 是作者给的默认值，
        n1n 若不接受 400 就在 patch 里调小）。

- **2026-11-06 · `dsh-file-tree` 改名 + Git 状态（工作区，未发版）**。参考 `dsh-better-sidebar` 的
  Git 状态实现，给文件树加：
  - Host 路由 `POST /api/dft.git`：`git status --porcelain=v2 --branch --ahead-behind -z --untracked-files=all`，
    限工作区路径、15 秒超时、4 MB 输出上限、`GIT_OPTIONAL_LOCKS=0`、`GIT_LITERAL_PATHSPECS=1`；
  - 客户端共享状态：20 秒轮询，窗口聚焦 / 菜单打开 / 文件操作后刷新；
  - 行着色 + 右侧字母徽标（`M/A/D/U/R/C/!`），目录按子项聚合；
  - 菜单顶部显示分支、操作中状态、改动数、ahead/behind，当前文件/目录显示暂存状态。
  同时把包名/目录/模块 id/locale 命名空间/CSS 前缀/Host 路由从 `file-tree-context-menu` /
  `ftcm` 统一改为 `dsh-file-tree` / `dft`。**未发版**。

- **2026-11-06 · `n1n-prompt-tools` 废弃删除（用户拍板）**。五组实验（见
  [prompt-cache-investigation.md](prompt-cache-investigation.md)）证明该网关下缓存收益为 0，
  插件失去存在理由，保留只剩故障面。删除清单：
  - **发布侧本来就没有可删的**：实测远端无 `n1n-prompt-tools-*` tag（`git ls-remote`）、
    npm `dsh-n1n-prompt-tools` 与旧名 `dsh-prompt-tools` 均 404（从未发布）、市场索引仅 3 条
    不含它——"未发版"属实，无需撤发布。
  - 本机装载：profile `package.json` 的 bundles 早先已不含它，但
    `profiles\desktop\node_modules\dsh-n1n-prompt-tools` 还有一个**符号链接**残留（cordis
    装载器扫 node_modules，插件因此仍在运行）。用 `cmd /c rmdir` 删链接（PowerShell 5.1
    对目录链接的 `Remove-Item` 会连带删目标——本仓库事故教训），删后核验源码目录完好。
  - 仓库：`git rm -r plugins/n1n-prompt-tools`（含 69 项测试、README/CHANGELOG），并
    `git rm` 三个 import 插件源码的脚本（`_dsml_fuzz` / `_dsml_repro` / `_proto_probe`；
    fuzz 方法论已文字化保留在 [text-tool-protocol.md](text-tool-protocol.md)）。
  - 参考插件本地副本 `plugins/dsh-llm-text-tools/`（未跟踪的第三方拷贝）：压缩备份至
    `~/.dsh/backups/dsh-llm-text-tools-copy-20261106.zip` 后删除；临时 dump
    `scratch_events.jsonl` 删除（会话原日志可再导出）。
  - 知识沉淀三份文档（见上「知识文档」表）+ 全部可复现缓存脚本已在删除**之前**提交入库。
  - 当前运行进程仍带着已加载的插件补丁，**下次重启后彻底消失**；重启后
    `%TEMP%\n1n-diag.jsonl` 不再增长即为验证。

- **2026-11-06 · 插件是否失效的最终核查（结论：缓存收益为 0，机制正常）**。这是为"全公司如何使用"
  做的决策依据，五组独立实验：

  | 实验 | 设计 | 结果 |
  | --- | --- | --- |
  | 规模扫描 | system 300/3000/8000 tokens × 两臂交错 | 均 98–99%，两臂每步都 +128 |
  | 深度扫描 | 对话深度 2→29 × 4 组 | 均 99%，两臂 deltas 完全一致 |
  | 30 轮配对 | 同一对话、同目录、交错 A/B | native 90% / text 96%，**miss 失衡仅 3 vs 1** |
  | 大 prompt | 深度 60/100（20–25K tokens） | 两臂均 99–100% |
  | 协议可靠性 | 真实读文件任务 × 10 | **两臂都 10/10 成功** |

  关键判据：孤立的 0% 步骤**两臂都会随机出现**（native 在 depth 100 就出现过一次），所以那是
  网关侧的淘汰，不是请求形态的属性。`3 vs 1` 的失衡在 4 次 miss 的总量下毫无统计意义。

  真实会话侧（重启后 7 步）：`prefixHash=eadd98b9` **9 次请求从未变化**、`tools=0`、
  `downgraded=False`、`sysHasCatalog=True`，逐 step 命中 100/98/**0**/100/99/98——那个 0% 与
  prefixHash 无关，同样是网关侧淘汰。

  **结论**：插件的机制一切正常，但它的立论（`tools` 字段把缓存钉在固定头部）在当前网关上
  **不成立**。缓存收益为 0，不装插件也能达到同样命中率。价值只剩行为偏好（模型能看到目录
  描述），成本是多一层解析器与降级风险。

  脚本：`_cache_size_sweep.mjs`、`_cache_real_scale.mjs`、`_cache_paired_dist.mjs`、
  `_protocol_reliability.mjs`、`_steps_usage.mjs`。

- **2026-11-05 · 重启复验 + 修掉"并发导致降级"的真 bug**。DSH 于 22:36 重启后：`llm:patch ok=true`、
  `downgraded=false`、`tools=0`、`sysHasCatalog=true`、`catHash=f4cc79f3`（31967 字符）、
  `prefixHash=eadd98b9` 连续四步不变、`paired 12 / orphaned 0`。重启后 6 个请求：首个 0%
  （切换本身），其余 **5/5 全中，平均 99%**。

  但日志暴露了上一版修复**没有真正生效**：`strikes` 的 key 只有 `provider::model`，并发流共用
  一个计数器。`14:04:25` 那一毫秒 `glm-5.3` 出现 12 条 stream，`2` 次阈值瞬间凑满，
  `deepseek-v4.1-flash` 随即在 `14:04:25.202` 被降级并持续到重启——**用户会话在为子 agent 的
  失败买单**。已修（`a5aa896`）：key 改为 `route::sessionId`（`llm/stream` 瀑布签名是
  `(options, next)`，没有 agent 对象，`sessionId` 是唯一可用隔离维度；无 session 的子 agent
  共用一个桶，因为群体失败本身就是模型的证据），并加 `autoDetectBurstMs`（默认 2000ms）
  让同一次 burst 只确认不累加。测试 67 → 69。

  另外顺带证伪了参考插件 `dsh-llm-text-tools` 的立论：把工具目录撑到 12K tokens 后，
  `native` 与 `text` 两臂都是 98–99%，且**缓存都随对话增长**（每步 +128），"tools 字段把缓存
  钉在 4096" 在当前网关上复现不出来（`scripts/_tools_field_ab.mjs`）。这意味着插件现在的
  缓存收益是 0，价值只在行为偏好——是否保留见待办。

- **2026-11-05 · 前缀缓存排查结论：网关不是瓶颈，插件自伤才是**。对 `llm-api.net` 做了受控
  实验，结论有三条：

  1. **网关缓存工作良好**。追加式请求（模拟真实会话逐步增长）命中率 88–98%；固定前缀连发
     18 次有 13 次命中（72%）；强制每次新建连接仍有 97%——不存在连接亲和问题。响应头有
     `x-routing-group: Self-Deployed-2`，18 次采样**从未切换路由组**，所以"多后端轮询导致
     粘性未命中"这个假设**被证伪**。
  2. **亲和头无效**。交错 A/B（`x-session-affinity` + `session_id` + `prompt_cache_key`）跑了
     两轮：20 轮时 baseline 90% / affinity 100%，45 轮时 baseline 96% / affinity 89%——
     方向相反，合计等于无差异。`prompt_cache_retention: "24h"` 也不影响（等待 6 分钟后两臂
     都 94%），说明 n1n 路由不实现该字段，与 asar 里"仅 `api.openai.com` 才发
     `prompt_cache_key`"一致。
  3. **真实会话的低命中是"故障期"造成的，不是上下文大小**。按 5 分钟墙钟分桶：09:25–10:10Z
     （插件故障期）0–6%，13:25–13:40Z（修复后）94/95/94/71%。按 turn 看更直接：turn 1 = 13%、
     turn 4 = 36%、**turn 5 = 94%、turn 6 = 91%**。而 turn 1 内部"较小一半 8% / 较大一半 18%"，
     大小并不驱动 miss——早先"上下文越大越差"的判断被推翻。

  **唯一确定可修的缓存损失**：模式切换。3 次切换后第一个请求命中率分别是 0%、0%、1%（3/3）。
  降级会让工具目录离开系统提示词、原生 `tools` 回来，前缀整个变掉。已在
  `a801f12` 修复（收紧判据 + 连续失败才降级）。
  在同一健康窗口内 text 94% / native 94%——**降级模式本身并不更冷**，代价只在切换那一瞬。

  脚本：`_cache_growing_probe.mjs`（追加式）、`_cache_routing_group.mjs`（路由组）、
  `_cache_ab_interleaved.mjs`（交错 A/B）、`_cache_ttl2.mjs`（TTL）、
  `_cache_switch_cost.mjs` / `_cache_window_compare.mjs`（切换代价）、`_cache_timeline2.mjs`。

- **2026-11-05 · `n1n-prompt-tools` 重启后实测通过**：DSH 于 21:25:36 重启，`llm:patch ok=true`，
  进程内 11 次 `llm:rewrite` 全部配对到 `stream`（**0 孤儿**），11 条流均为 `TEXT tools=0`、
  `downgraded=false`（此前的 `autoDetect` 降级是旧进程的记忆，重启后自动恢复文本协议）。
  turn 5 的 12 个步骤每步都解析出工具调用，**真实泄漏 0 次**（判据收紧为"正文含调用语法且
  该消息没解析出 call"；早先按关键字粗筛出的 7 条是回复里正常出现 `@@TOOL@@` 字样的误报，
  每条都带 1–3 个已解析调用）。缓存命中率 10 步平均 89%。前缀仍稳定（`catHash=f4cc79f3`）。
  63 项单元测试全绿。校验脚本：`scripts/_verify_plugin.mjs`（日志侧配对）、
  `scripts/_verify_session.mjs` / `_verify_session2.mjs`（会话侧泄漏与命中率）。

- **2026-11-05 · `n1n-prompt-tools` 修复 DSML 落进正文（出站/入站合并为单一权威点）**：
  真实故障是 `turn 3 step 1` 把 `<｜｜DSML｜｜ invoke …>` 原样写进正文（1393 字符），整轮没
  执行任何工具。对同一段文本做了 1876 种分片回归（1 字符 / 7 字符 / 逐位置二分 / 三刀网格）
  **全部解析正确**，证明解析逻辑无罪。诊断日志显示该请求只有 `llm:rewrite`、**没有 `stream`**：
  出站改写挂在 `streamWithRegistration` 补丁、入站解析挂在 `llm/stream` 监听器，两个独立注入
  点会脱钩；且补丁恢复失败被 `try/catch` 静默吞掉，插件停用后补丁仍在剥工具（全量 214 次
  `llm:rewrite` 有 6 次无配对 `stream`，其中 `10:11:50Z` 那次正是 `tools=32` 的主回合）。
  修法：补丁改写后**自己**包装 `createInboundTransform`（`parseReply` 兼容同步流与 Promise）；
  `armed` 标志在 `dispose()` 首步置 `false`，让孤儿补丁退化为透传；`parsedByPatch` WeakSet
  标记已接管请求，监听器见之直接 `next()` 避免二次解析。测试 63 项（新增 3 条回归）。
  另确认 17 次 `EMPTY_RESPONSE` 重试**不是本插件造出来的**：DSH 适配器本身就把"终止 `stop`
  且无内容块"判为 `EMPTY_RESPONSE` 并交由默认策略重试，属 n1n/mimo 返回空响应的独立问题。

- **2026-11-05 · `n1n-prompt-tools` 借鉴 `dsh-llm-text-tools`**：对照参考插件补齐
  `emptyResponseGuard`（reasoning-only 的 `stop` 判为可重试 `EMPTY_RESPONSE`）、
  `dropEmptyTurns`（不再回放空 assistant 回合）、`includeSchemas`（可只看参数名前缀），
  协议文本显式禁写 DSML/XML 并附示例行；测试 59 项。
  **缓存实测**（`scripts/_cache_report.mjs`、`_cache_cause.mjs`）：Cybertron 会话 212 步、
  prompt 合计 2191 万 token、整体命中 56.5%，但 99% 与 0–13% 反复跳变——同一会话里
  工具集哈希始终不变，说明**崩塌不是 tools 字段引起**，更像网关侧前缀缓存过期/淘汰。
  出站拦截最终落在 `LlmRuntime#streamWithRegistration`（唯一汇聚点），因为
  `llm/stream` 的兜底闭包固定捕获原 options，且请求对象被 `deepFreeze`。

- **2026-11-03 · 仓库 GitHub 化**：`origin` 指向 GoDSH；CI（`validate` / `release` / `pages`）、
  `scripts/validate-plugins.mjs`、`scripts/release.mjs`、`scripts/make-market-index.mjs`、
  `repo.config.json` 单一配置源；GitHub Pages 托管市场索引。
- **2026-11-03 · `file-tree-context-menu` 1.0.0**：右键加入对话（引用芯片）、复制 `@` 引用 / 路径 /
  `file://` / Markdown 链接、DSH 内预览、终端打开、AI 总结/解释、新建/重命名/回收站删除、多选批量；
  移除「打开方式…」。Host 侧有 `POST /api/ftcm.fileops`（工作区根校验；现改为 `/api/dft.fileops`）。
- **2026-11-03 · `composer-skill-picker` 1.0.0**：输入框工具行常驻「技能」下拉框
  （`conversation.input.left`，order 80，样式对齐内置模型选择器）；
  发现 `.dsh/skills`、`.agents/skills`，选中即插入 `/技能名 ` 并交还焦点。
- **2026-11-03 · `auto-retry` 1.0.0**（Host-only，无 UI）：
  - 第 1 层 `agent/request-error`：指数退避 + 抖动重试，尊重 `providerRetryAfterMs`，
    按 `turn:step` 计到 `maxRequestRetries`（默认 6）。
  - 第 2 层 `turn/end`（`reason.kind === 'error'`）：延时 `agent.followup()` 一条 `<auto_resume>`
    续跑，计到 `maxConsecutiveResumes`（默认 5）；`completed`/`aborted`/`blocked` 清零预算。
  - 失败分类：5xx 与 408/409/425/429 可重试；`AUTH`/`API_KEY`/`QUOTA`/`CONTEXT_LENGTH` 等不可重试 code
    优先于状态码判定。
  - 安全边界：`aborted`（用户停止）不续跑；`pauseOnUserInput` 下用户发言取消待续跑；
    卸载清空全部定时器。不 import 任何 `@deepseek-ai/*`（`inject = ['agents']`）。
  - 13 项行为测试：`node --test test/auto-retry.test.mjs`。
- **2026-11-04 · 可见的重试提示**：重试前写 `llm/retry`、等待结束写 `llm/retry-started`，
  复用宿主 `client-ui-chat` 的 `RetryNodeView`，对话里出现「正在重试模型请求（1/6） · 3s」
  （倒计时、可展开看失败原因与延迟、停止后变「已取消」）。
  `policyKey` 用 `auto-retry`，与内置 `llm-retry` 的计数互不干扰；`session.append` 抛错只记日志。
- **2026-11-04 · 单插件独立发布**：索引改为**按 tag 钉版本**，发一个插件不再顺带发布其他插件；
  `release.mjs` 增加 `tag-only` 模式。
- **2026-11-04 · 改名并发布 npm**：`@local/*` → `dsh-auto-retry` / `dsh-composer-skill-picker` /
  `dsh-file-tree-context-menu`，去掉 `private`，三个包 1.0.1 已上公共 npm；
  本机 profile 依赖键同步换名。
- **2026-11-04 · 仓库梳理**：安装方法抽成 [install.md](install.md)，交接文档并入本页，
  `CONTRIBUTING.md` 迁入 `docs/contributing.md`，`AGENTS.md` 转为本地私有（进 `.gitignore`）。
- **2026-11-05 · `n1n-prompt-tools` 语法扩容（本地未发版，未提交版本号）**：实测 n1n 下 8 个模型，
  补齐第三种方言 `<tool_call>`（JSON 信封体与 `<function=…><parameter=…>` 标签体，参数按出站
  捕获的 Schema 强转）；`extractInvokeCall` 改为边界扫描，容忍模型把闭合标签写坏
  （用 `｜DSML｜>` 顶替规范写法）；新增 `autoDetect`（回复出现调用语法却没解析出调用 → 该路由
  降级原生 tools）、`denyModels` 黑名单、`parseStrippedRoutes` 兜底。实测 5/9 模型原生遵循
  `@@TOOL@@`，2 个靠新解析器可用，`glm-5.3` 与 `kimi-k3` 不可用。**模态与协议遵从无关**：
  `qwen3.8-max-0902` 支持图像却不认文本协议，`glm-5.3-flash` 纯文本反而认。44 项测试。
  注意：改了 `index.js`/`cordis.patch.yml` 必须**重启 DSH** 才生效（进程不热重载 host 插件代码）。

- **2026-11-05 · `n1n-prompt-tools` 1.0.0（新增，本地未发版）**：解决 native `tools` 字段吃掉
  前缀缓存的问题（**只针对 n1n 网关**，原名 `prompt-tools` 因定位收窄而改名）。出站
  `system-prompt/assemble` 把工具清单确定性渲染进系统提示词并清空 `assembly.tools`；入站
  `llm/stream` 把模型输出的文本调用解析回标准 `tool-call` 块，**两种语法都认**：
  `@@TOOL@@ {...}` 与模型漏出的 XML `<｜DSML｜ invoke ...>` 形式（跨 chunk、字符串转义、
  代码围栏、多调用、扁平参数容错）。**供应商硬限制**：只作用于 `provider === 'n1n'`，
  `resolveOptions` 把配置里混入的其它 provider 丢弃、`routeAllowed` 拒绝非 n1n 路由、
  出站入站双水位各自校验，且**移除了「空数组 = 全部 provider」的开关**（空数组 = 不生效）；
  另加可选 `models` 白名单（n1n 内 `glm-5.3` 不遵循文本协议，需排除）。30 项单元测试
  （其中 8 项专门测这道闸门，含 3 项直接跑 `apply()` 两个 hook 的端到端断言）；`deepseek-v4.1-flash` 实测协议可被正确解析，本会话 `tools`
  字段已消失、命中率 98~99%。
  注：受控 A/B 显示 `tools` 字段并非真实长会话缓存塌陷的唯一/主要成因（更像网关多后端随机
  未命中），插件保证“连续确定性文本前缀”这一前提，详见插件 README 的实测结论。

## 待办

1. **人工冒烟（最有价值）**：重启 DSH 后逐项确认
   - 文件树 Git 状态：改动文件着色/字母徽标、目录聚合、菜单分支与暂存状态、非 Git 目录不显示；
   - 右键菜单：加入对话芯片、复制链接、DSH 预览、终端、新建/重命名/回收站、多选；
   - 技能下拉框：`E:\5_8U\Cybertron` 会话应列出项目技能，本仓库应显示「当前项目没有技能」；
   - **auto-retry 真实故障**：断网/VPN 触发模型失败 → 应看到「正在重试模型请求（n/6） · Ns」；
     整轮失败则应看到 `[auto-retry] ... resume 1/5 scheduling in ...ms` 且约 5s 后自动续跑；
     用户抢话应取消待续跑；点停止不应续跑。
2. `docs/publishing.md` 记录的两个 npm 账号坑若再遇到，按文档处理（2FA token / `0.0.0-stage` 占位）。
3. ~~**`n1n-prompt-tools` 冒烟**~~ / ~~**决定插件去留**~~ —— **已定案（2026-11-06）：废弃删除。**
   五组实验证明该网关下缓存收益为 0（实验细节与全部数据已整理进
   [prompt-cache-investigation.md](prompt-cache-investigation.md)），插件机制虽正常但失去
   存在理由；协议方言与降级设计教训见 [text-tool-protocol.md](text-tool-protocol.md)。
   它从未发版：无 git tag、npm 404、不在市场索引，删除无需撤发布。
4. 可选：在 npmjs.com 用 2FA 手动删掉三个包的 `0.0.0-stage` 占位版本，让包页干净。
5. 计划新插件：`node scripts\new-plugin.mjs dsh-xxx`。
6. **RTK 接入评估（2026-11-06 调研 + 复测，已轻度接入）** —— 见下节「省 token 工具的调研结论」。
   已把 `rg.exe` 放进 `~/.local/bin` 修好 `rtk rg`；结论是「只在手工终端用 `rtk git log` / `rtk rg`，不写插件」。
7. **LSP 级代码查询**（同上节），两条路线待选。

## 省 token 工具的调研结论（2026-11-06）

背景：用户问「有没有 LSP / RTK 这类省 token 或加速代码查询的工具或插件」。以下是本机实测结果，**均未落地，仅备查**。

### 现状：DSH 已内建的轻量化机制

| 机制 | 来源包 | 作用 |
|---|---|---|
| `grep` / `glob` / `read` | `dsh-tool-fs-search`、`dsh-tool-fs` | ripgrep 级检索，只回行号+命中行 |
| 超长输出落盘 | `spill-policy` / `spill-local` | 大结果写文件，上下文只留摘要+路径 |
| 旧结果裁剪 | `tool-result-pruner` | 剪掉历史轮次的大块工具输出 |
| 上下文压缩 | `compaction-basic` | 会话过长时压缩 |
| 上下文隔离 | `subagent` / `workflow` | 检索/审计外包给子代理，主会话不吃 token |
| 用量观测 | `token-meter` | token 统计 |

**结论：没有符号级（LSP）查询，但通用轻量化机制齐全。** 大输出靠 spill + 子代理隔离，而非压缩命令输出。

### RTK（`rtk-ai/rtk`，Rust Token Killer）

- 本机**已装**：`rtk 0.45.0` → `C:\Users\congzhisen\.local\bin\rtk.exe`。
- 定位：**CLI 代理**，拦截 shell 命令并压缩其输出（不是 LSP，不做符号级查询）。100+ 命令过滤器，官方称 <10ms 开销（实测约 56ms，见下）。
- **接入 DSH 的硬障碍**：`rtk init --agent` 的取值只有 `claude / cursor / windsurf / cline / kilocode / antigravity / kimi / pi / hermes / droid / vibe`，**没有 DSH**。它的 hook 挂在「Bash 工具调用」上，而 DSH 的 shell 工具是 `pwsh`，且 `read`/`grep`/`glob` 是原生工具不走 shell —— 与 README 自述的限制一致（"hook only fires on Bash tool calls"）。

**2026-11-06 复测数据（本仓库实测，非估算）**：

| 场景 | 原生 | `rtk` | 省 |
|---|---|---|---|
| `git log -20` | 16,879 字符 | 6,310 | **63%** |
| `git log -5` | 4,452 | 1,736 | **61%** |
| `git status` | 679 | 539 | **21%** |
| `rtk rg`（docs 搜索 35 条） | 3,034 | 2,321 | **24%** |
| `git log --oneline -30` | 2,276 | 2,276 | 0%（原样透传） |
| `git show --stat HEAD` | 1,018 | 1,018 | 0%（原样透传） |
| `git diff HEAD~2` | 5,075 | 4,946 | 3%（几乎无用） |
| 单次调用额外开销 | 53 ms | 110 ms | **+56 ms**（官方称 <10ms，实测不符） |

> 测法注意：统计长度时必须屏蔽 stderr（`2>nul` / `2>$null`），否则那行 77 字符的
> `No hook installed` 噪音会污染百分比 —— 不屏蔽时会算出「rtk 反而大 3~8%」的假结论。
> 上表是屏蔽后的干净数据。

- **`rtk rg` 已修好**。它不自己实现搜索，而是转发给系统的 `rg`（ripgrep）再压缩返回结果；本机无 `rg` 在 PATH 上，故首轮实测报
  `Binary 'rg' not found on PATH`，据此误判「12.9% 不可复现」——**该结论错误**。
  实际上 ripgrep 就在机器上（Typora 自带 `ripgrep 13.0.0`），已复制到 `~/.local/bin/rg.exe`（该目录本就在 PATH，`rtk.exe` 同在此），
  从此 `rtk rg` 全局可用，历史 18.6M / 3,885 次的节省量是真实可复现的。
- **`rtk rg` 的压缩部分来自截断长行**，搜定位够用，但内容不完整。DSH 自身的 `grep` 工具不走 shell，不受此影响，此项主要惠及手工终端操作。
- **仍不可用**：`rtk ls`、`rtk wc`（需要 POSIX `ls`/`wc`；Git for Windows 的 `usr\bin` 里有，但属 MSYS2 二进制，
  依赖 `msys-2.0.dll`，单独拷贝跑不起来；整目录入 PATH 又会遮蔽 Windows 自带命令，不划算）。`rtk tree` 与系统 `tree.com` 参数冲突，同样不可用。
- **可用**：`rtk git log`（60%+）、`rtk rg`（24%，已修）、`rtk find`、`rtk read`、`rtk config`、`rtk gain`；
  另有未验证但可能有用的一组：`rtk test`（只显示失败）、`rtk err`（只显示错误/警告）、`rtk dotnet build|test`、`rtk pnpm`。
- **噪音问题可解**：每次调用往 stderr 打 `[rtk] No hook installed — run rtk init -g`（77 字符）。
  在 PowerShell 里用 `& rtk git log -3 2>$null` 即可屏蔽（实测 1102 → 1025 字符），不必去跑 `rtk init -g`。

**判断：轻度接入，不写插件。** 值得做的只有两件低成本的事：

1. `rg.exe` 放进 `~/.local/bin`（已完成）→ `rtk rg` 可用；
2. `git log` / `git status` 走 `rtk`（省 63% / 21%），这是唯一真正值钱的一档。

`rtk` 压不动时会**原样透传**（`--oneline`、`--stat` 都是 0%，不会帮倒忙），
所以规则可以放宽成「拿不准就试，反正最坏是持平」。

已把这条偏好写进用户全局 `~/.dsh/AGENTS.md` 的「命令行工具偏好（RTK）」一节。

### 为什么没写「RTK 自动化插件」（2026-11-06 查证，决定不做）

用户问过能否用插件把 RTK 自动化，免得靠 AGENTS.md 自觉。查了 DSH 的工具注册表类型定义
（`@deepseek-ai/dsh-tools` 的 `lib/types/index.d.ts`），结论是**一半做不到、一半不值得**：

| 钩子 | 能力 | 能否用于 RTK |
|---|---|---|
| `tools/pre-execute` | `allow` / `deny` / `ask` | **不能改参数** |
| `tools/execute` | 环绕执行 | **只能改 `exec.signal`**，调用标识不可变 |
| `tools/post-execute` | `accept`（可换 `content`）/ `block` | 能换结果，但命令已跑完 |

框架原文（`index.d.ts:402-407`）：

> Pre-dispatch decision. `allow` runs the call; `deny` materializes an error; `ask` runs only
> after an approval service returns `allowed-once` ... **Input rewriting is excluded because
> arguments are already logged and presented.**

以及 `tools/execute` 的说明：

> wrappers may change only `exec.signal`, while call identity remains immutable.

所以「插件把 `git log` 悄悄改写成 `rtk git log`」是**框架层面禁止**的，不是保守估计。
参数已经记进日志并展示给用户，事后偷改会让记录对不上。

留给插件的只剩「事后替换结果」，但命令已经以原始形式跑完，要拿压缩版只能再跑一次 `rtk`
（每条 +110ms），或走 stdin。而 **stdin 路线有丢数据风险**，实测：

| 方式 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `git log -20 \| rtk pipe -f git-log` | 17,512 字符 | 298 字符（"省 98%"） | **20 个 commit 只剩 1 个**，其余进 `[+254 lines omitted]` —— 这是丢内容，不是压缩 |
| `rtk git log -20`（直接代理） | 16,879 | 6,310（省 63%） | 保留全部 20 条，只截每条正文 |

**结论：不做。** 理由三条：
1. 收益面窄 —— RTK 只覆盖 shell，会话 token 大头是 `read` 读文件与工具结果；
2. 要么重跑（+110ms/条，还得维护「哪些命令只读可重跑」的白名单），要么丢内容；
3. DSH 已有 spill-policy（大输出落盘）与 tool-result-pruner，做的是同一件事，重复建设。

若将来仍要做，最小可行设计：`tools/post-execute` 判断 `exec.name === 'pwsh'` 且命令命中
**只读白名单**（`git log` / `git status` / `git diff --stat`），重跑 `rtk` 后替换 `content`，
并在开头标注「已压缩」。

### LSP 级代码查询（真正的「快查询 + 省 token」）

没有现成 DSH 插件。两条路线：

1. **官方 MCP 客户端桥（推荐先试）**：`@deepseek-ai/dsh-mcp-client@0.2.2-rc.1`，版本号与当前 DSH 完全对齐，定位就是「连接外部 MCP 服务器，把工具注册到 `ctx.tools`」，工具名形如 `mcp__<server>__<tool>`。当前 desktop profile **未装未配**。配置示例（写进 profile 的 `cordis.patch.yml`）：

   ```yaml
   - id: mcp-serena
     name: '@deepseek-ai/dsh-mcp-client'
     config:
       serverName: serena
       transport: stdio
       command: uvx
       args: ['--from', 'git+https://github.com/oraios/serena', 'serena', 'start-mcp-server', '--context', 'ide-assistant']
   ```

   接上后可用 Serena（LSP 后端）的 `find_symbol` / `find_referencing_symbols` / `replace_symbol_body` —— 查引用回的是「文件:行号」列表而非整份源码，这才是省 token 的关键。也可换 ast-grep MCP（结构化搜索）。代价：MCP 工具 schema 进每次请求前缀；stdio 子进程有启动开销。

2. **自研 `dsh-lsp-tools` 原生插件**：走 `ctx.tools.register()`，比 MCP 少一层协议开销，输出格式完全可控（可强制「只回 文件:行号:一行摘要」）。后端可挂 `typescript-language-server` / `pyright` / `clangd` / `rust-analyzer`，stdio JSON-RPC。开发量大，需先定语言后端与工具集。

### 建议顺序

1. 先装 MCP 客户端 + 接 Serena 试水（改动小、可回滚、立刻能验证收益）；
2. 验证有效再考虑自研原生插件；
3. RTK 最后看：先解决 stderr 噪音与 `ls`/`rg` 缺二进制两个问题，再决定是否值得做命令改写插件。

## codegraph 接入记录（2026-11-06，已装，走 MCP）

### 先试后弃：dsh-plugin-codegraph 0.6.2

最初装的是 [`dsh-plugin-codegraph@0.6.2`](https://github.com/CC19990113/dsh-plugin-codegraph)（MIT，作者 CC ZHAO），
`plugin_manager install_bundle` + `registry=https://registry.npmjs.org/`（profile 默认 registry 是内网镜像）。
四个行全部热加载为 `active`：

| 行 id | 模块 | 作用 |
|---|---|---|
| `codegraph` | `dsh-plugin-codegraph-service` | 定义 `ctx.codegraph` 能力缝 |
| `codegraph-sqlite` | `dsh-plugin-codegraph-sqlite` | 只读查询 store |
| `codegraph-tree-sitter` | `dsh-plugin-codegraph-tree-sitter` | 自建 tree-sitter 索引器 |
| `codegraph-tool` | `dsh-plugin-codegraph-tool` | `codegraph` / `codegraph_index` 两个工具 |

当时在 profile `cordis.patch.yml` 末尾加了「关自动索引」的覆盖（安装本身不写这个文件，是手动加的），
改前备份在 `~/.dsh/backups/cordis.patch.yml.20261106-095345`（含 `.package.json`）：

```yaml
- id: codegraph-tree-sitter
  name: "dsh-plugin-codegraph-tree-sitter"
  config: { watch: false, autoIndexOnSession: false }
- id: codegraph-tool
  name: "dsh-plugin-codegraph-tool"
  config: { backgroundIndex: false, updateCheck: false }

改前备份在 `~/.dsh/backups/cordis.patch.yml.20261106-095345`（含 `.package.json`）。

### 关键发现：现有索引是 schema v11，被否掉的插件只认 v4

我此前在对话里说「Cybertron 那个 1.67 GB 的索引可以直接被读」，**这句是错的**，实测推翻：

| 事实 | 证据 |
|---|---|
| Cybertron 索引的格式版本 | `SELECT MAX(version) FROM schema_versions` → **11** |
| 插件 store 支持的版本 | `dsh-plugin-codegraph-sqlite/lib/database.js`：`SUPPORTED_FORMAT_VERSION = 4` |
| 不匹配时的行为 | 抛 `CODEGRAPH_UNSUPPORTED_FORMAT`，**fail loud，不做兼容读** |
| 面板接口的实际回答 | `{"ok":false,"message":"这个工作区的索引由旧版本构建，没有状态摘要；先跑一次 codegraph_index 重建"}` |

根因是插件 README 的立论过时了：它声称读写的就是 `@colbymchenry/codegraph` 的 schema v4，
但本机 CLI 已是 **1.6.1**，写的是 v11（新增 `route`、`component` 等节点类型）。
插件 0.6.2 停在 v4，落后于 CLI 的格式演进。

**危险点**：`codegraph-tree-sitter` 的 `writeGraph()` 用「同目录临时文件 + rename」**整体替换**
`.codegraph/codegraph.db`，且**不检查旧文件的格式版本**。所以在 Cybertron 上跑 `/codegraph index`
会把 1.67 GB 的 v11 索引覆盖成 v4 索引 —— 既丢 `route`/`component` 节点，也可能让 CLI 1.6.1 读不了。

当前已通过 `watch: false` + `autoIndexOnSession: false` 把这条路堵死（实测：仓库内未生成 `.codegraph/`，
Cybertron 的 db 时间戳仍是 11-05 17:29）。

### 决策：走 MCP，不走自带索引器

`dsh-plugin-codegraph@0.6.2` 已 `remove_bundle` 卸载，改为
[`dsh-plugin-codegraph-project@0.1.5`](https://github.com/troytse/dsh-plugin-codegraph-project)（MIT，作者 troytse）。
它**不碰索引文件**，只通过 `npx` 拉起 `codegraph serve --mcp`，由 CLI 自己读写 v11 —— 格式问题不存在了。
四个 codegraph 行随之消失，当前只剩一行 `codegraph-project`（已 `active`）。

profile `cordis.patch.yml` 末尾的覆盖：

```yaml
- id: codegraph-project
  name: "dsh-plugin-codegraph-project"
  config:
    version: "1.6.2"   # 对齐本机 CLI（1.6.1 写的 v11，用 1.6.2 读）
    telemetry: false
```

改前备份：`~/.dsh/backups/cordis.patch.yml.20261106-100229.pre-mcp`（含 `.package.json`）。

### 实测验证（全链路已通）

| 验证项 | 结果 |
|---|---|
| MCP 握手 | `initialize` 返回 `serverInfo: {name: codegraph, version: 1.6.2}`，`tools/list` 正常 |
| 读 v11 索引 | `codegraph_search("AgentLoop")` 命中 `Modules/WebApp/HpsAgent/src/agent-loop.ts:208` 等 5 条 |
| 单次查询体积 | 546 字符（对比整份源码，这才是省 token 的地方） |
| npx 冷启动 | **82 秒**（首次下载平台包），热启动 **2.6 秒** |
| 插件专用缓存 | 已预热 `~/.dsh/codegraph/npm-cache`（307 MB，12 秒） |

工具默认只暴露 `codegraph_explore`。要开其他工具需在**启动 harness 的环境**里导出
（插件行没有 `env` 配置项）：`export CODEGRAPH_MCP_TOOLS=explore,node,search,callers`。

本仓库也已建索引（87 文件 / 1459 节点 / 2841 边，4.2 秒），并已把 `.codegraph/` 加进 `.gitignore`。

### 已知前提与坑

- **必须重启 DSH 并开新会话**。插件挂在 `ctx.on('agent/created')` 上（`lib/index.js:247`），
  只对**创建时**插件已激活的会话做项目判定。本会话建于插件安装之前，所以看不到工具 —— 这不是故障。
- 插件按「会话 cwd 向上走、遇 git 根停、认 `.codegraph/*.db`」定位项目（`lib/locate.js`），
  与 CLI 规则一致；Cybertron 根目录就有索引，能直接匹配。
- `~/.codegraph` 与家目录**永不算项目**（除非 `allowHomeProject: true`）。
- Windows 下 `resolveNpx` 优先取 `npx.cmd`（`lib/pool.js`），本机可用。
- 本机还有一个 **VS Code 的 CodeGraph 扩展**（PID 54360，父进程 `Code.exe`，11-05 17:26 起）
  跑着 `serve --mcp --no-watch` 并持有 writer 锁，所以新起的 MCP 服务会以
  「in-process 只读、不自动同步」的降级模式工作。**查询不受影响**，但索引不会自动跟随改动刷新。
  需要时在对应目录手动 `codegraph sync`。

### 待办

- [ ] **重启 DSH**，在 `E:\5_8U\Cybertron` 或本仓库开新会话，确认 `mcp__codegraph__codegraph_explore`
      出现在工具列表并能返回结果；
- [ ] 若要保住 Cybertron 的 v11 索引，**任何情况下都别在那个目录跑 `codegraph_index`**；
- [ ] 待评估：只读降级模式下索引会过期，是否需要在收尾时补一条 `codegraph sync`；
- [ ] 可给 `dsh-plugin-codegraph` 上游提 issue：`SUPPORTED_FORMAT_VERSION` 需跟进 CLI 1.6.x 的 v11。

## 恢复记录（2026-11-03 误删事故）

经过与教训见 [repo-layout.md](repo-layout.md#事故复盘2026-11-03-误删插件源文件)。
一句话：**改完就 `git commit`**，不要对唯一副本做「移动 + 清理」的组合操作。
