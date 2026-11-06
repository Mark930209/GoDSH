# 当前状态（快照 2026-11-04）

> 新会话进本仓库时，读这一页 + [plugin-dev-guide.md](plugin-dev-guide.md) 即可接续。
> 安装见 [install.md](install.md)，发版见 [publishing.md](publishing.md)。

## 一句话状态

三个插件（`auto-retry` / `composer-skill-picker` / `file-tree-context-menu`）已统一到
**1.0.1**，包名从 `@local/*` 改为可直接发布的 `dsh-*`，**同时上线了三条分发渠道**：
git tag + GitHub Release、公共 npm、GitHub Pages 市场索引。本机 desktop profile 以 `link:`
装在源码目录，三个条目均为 `fiberPhase: active`。

## 插件状态

| 目录 | npm 包名 | 版本 | tag（commit） | 本机安装 |
|---|---|---|---|---|
| `plugins/auto-retry` | `dsh-auto-retry` | 1.0.1 | `auto-retry-v1.0.1`（`fb77d67`） | link，active |
| `plugins/composer-skill-picker` | `dsh-composer-skill-picker` | 1.0.1 | `composer-skill-picker-v1.0.1`（`e30c3b2`） | link，active |
| `plugins/file-tree-context-menu` | `dsh-file-tree-context-menu` | 1.0.1 | `file-tree-context-menu-v1.0.1`（`2d3e8e1`） | link，active |
| `plugins/n1n-prompt-tools` | `dsh-n1n-prompt-tools` | 1.0.0 | 未发版（本地 1.0.0） | link，待安装验证 |

- 公共 npm：`latest` 均为 `1.0.1`，已实测 `npm i` 三个包可装在干净目录。
  npm 包页同时残留一个 `0.0.0-stage` 占位版本（staged publishing 产物，见
  [publishing.md](publishing.md#账号层面的两个坑已踩过)），不影响安装。
- 市场索引：<https://mark930209.github.io/GoDSH/market-index.json>（实测 200，3 条，均 1.0.1）。
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
| npm 账号 / token | `guimaxingtian`，`~/.npmrc` 存 `//registry.npmjs.org/:_authToken`（Classic → Automation）；本机默认 registry 是内网镜像 `http://10.66.12.81:4873/`，发布必须显式 `--registry=https://registry.npmjs.org/` |
| Node / Git / npm | v24.15.0 / 2.46.0 / 11.12.1 |
| 验证基线 | DSH `0.2.1-rc.5`，Windows 桌面端 |

## 已完成（时间线）

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
  移除「打开方式…」。Host 侧有 `POST /api/ftcm.fileops`（工作区根校验）。
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
   - 右键菜单：加入对话芯片、复制链接、DSH 预览、终端、新建/重命名/回收站、多选；
   - 技能下拉框：`E:\5_8U\Cybertron` 会话应列出项目技能，本仓库应显示「当前项目没有技能」；
   - **auto-retry 真实故障**：断网/VPN 触发模型失败 → 应看到「正在重试模型请求（n/6） · Ns」；
     整轮失败则应看到 `[auto-retry] ... resume 1/5 scheduling in ...ms` 且约 5s 后自动续跑；
     用户抢话应取消待续跑；点停止不应续跑。
2. `docs/publishing.md` 记录的两个 npm 账号坑若再遇到，按文档处理（2FA token / `0.0.0-stage` 占位）。
3. **`n1n-prompt-tools` 冒烟**：装到 desktop profile 后，在 n1n 的会话里让模型做一次工具调用
   （如读取文件），确认：工具真的执行、UI 正常显示、会话记录里 assistant 是 `tool-call` 块。
   **重启后重点看两件事**：日志里不应再出现被"讨论插件"触发的 `auto-detect` 降级；并发子 agent
   同时失败时应看到 `burst: true` 而不是计数直接跳到 2。
4. **决定插件去留**（已用五组实验核实，待用户拍板）：
   - 事实一：`tools` 字段不再阻止缓存增长（300 / 3000 / 8000 tokens 三种 system 规模，
     20–25K 真实规模，30 轮配对，两臂全部 98–99%，缓存都随对话增长）；
   - 事实二：健康窗口内 text 与 native 命中率同为 94–99%；
   - 事实三：文本协议本身可靠（读文件任务两臂都 10/10 成功）。
   **结论：插件当前的缓存收益是 0**，"保住命中率"不靠插件也能达到。
   - 保留的理由只剩行为偏好（让模型看到 32 个工具的目录与描述），成本是多一层解析器与降级风险；
   - 停用的理由是少一层故障面——本会话的故障根因全在这一层（DSML 泄漏、漏降级、并发误降级）；
   - **给公司的注意点**：不要把它当缓存优化来推广；若要推广，理由应是行为一致性，且需接受
     解析器维护成本。参考插件 `dsh-llm-text-tools` 的 README 立论已过时，不宜直接引用。
5. 可选：在 npmjs.com 用 2FA 手动删掉三个包的 `0.0.0-stage` 占位版本，让包页干净。
6. 计划新插件：`node scripts\new-plugin.mjs dsh-xxx`。

## 恢复记录（2026-11-03 误删事故）

经过与教训见 [repo-layout.md](repo-layout.md#事故复盘2026-11-03-误删插件源文件)。
一句话：**改完就 `git commit`**，不要对唯一副本做「移动 + 清理」的组合操作。
