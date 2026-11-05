# Changelog

## 未发版 — 2026-11-05（修复"DSML 落进正文、整轮不执行工具"：出站/入站合并为一个权威点）

一次真实故障：`turn 3 step 1` 把 `<｜｜DSML｜｜ invoke …>` 写进了正文（1393 字符原样显示给
用户），解析器完全没参与，于是这一轮没有任何工具被调用。用同一段文本对解析器做了 1876 种
分片回归（1 字符、7 字符、逐位置二分、三刀网格）**全部能正确解析**，所以解析逻辑没问题。

诊断日志定位到真正原因：那一请求只留下 `llm:rewrite`，**没有 `stream`**。

- 出站改写挂在 `streamWithRegistration` 补丁上，入站解析挂在 `llm/stream` 监听器上——两个
  独立注入点。二者一旦脱钩，就变成"工具被剥掉、却没人解析回复"的最坏状态。
- 补丁在 `dispose()` 里靠 `try/catch` 恢复，失败被静默吞掉，于是插件停用后补丁仍然生效，
  继续剥工具。复现证据：全量诊断里 214 次 `llm:rewrite` 有 6 次没有配对 `stream`，其中
  `2026-11-05T10:11:50Z` 那次正是 `tools=32` 的主回合。

修复：

- **改写谁剥的工具，就由谁解析回复**：`patchedStreamWithRegistration` 在改写后直接
  `createInboundTransform` 包装返回值（`parseReply` 同时兼容同步流与 Promise），不再依赖
  另一个监听器是否还活着。
- **`armed` 标志**：`dispose()` 第一步就置 `false`，让遗留的孤儿补丁退化成纯透传；恢复失败
  改为记 `llm:unpatch` 诊断而不是静默。
- **`parsedByPatch` WeakSet**：按对象身份标记已被补丁接管的请求，`llm/stream` 监听器见到就
  直接 `next()`，避免同一个流被解析两遍。

测试增至 63 项，新增 3 条回归：无监听器时补丁仍能解析自己剥过的回复；停用后遗留补丁不再
改写；监听器不重复解析已接管的请求。

**重启后实测通过**（DSH 21:25:36 重启）：`llm:patch ok=true`，进程内 11 次 `llm:rewrite`
全部配对到 `stream`（0 孤儿），11 条流均为文本协议且 `downgraded=false`；turn 5 的 12 个
步骤每步都解析出工具调用，真实泄漏 0 次，缓存命中率平均 89%。早先按关键字粗筛出的若干
"泄漏"是误报——那些回复本身正常讨论了 `@@TOOL@@` 文本，且每条都带已解析的调用。

## 未发版 — 2026-11-05（借鉴 dsh-llm-text-tools：止住空回答 + 前缀瘦身）

对照 `plugins/dsh-llm-text-tools` 的做法补齐三处：

- **空响应守卫 `emptyResponseGuard`（默认开）**：模型只输出 reasoning、既无正文也无
  工具调用就以 `stop` 结束时，改报可重试的 `EMPTY_RESPONSE`，交给 `dsh-auto-retry`/
  运行时重试一次，而不是把空回答落盘让界面出现空气泡。这正是"回答总是异常中断"
  的主要成因之一（`dsh-llm-text-tools` 把这条列为历史上的主 bug）。
- **丢弃空 assistant 回合 `dropEmptyTurns`（默认开）**：回放 `{role:'assistant',
  content:''}` 会诱导推理模型继续输出空回答，改成在改写请求时直接不发送这一回合，
  顺带缩短缓存前缀。
- **`includeSchemas`（默认开）**：关掉后只在提示词里保留参数名，缓存前缀更短。

协议文本同时强化：显式点名禁止 DeepSeek DSML 标签（`<|DSML| calls>` / `<|DSML| invoke>`）
与 `<tool_call>`/`<invoke>` 等 XML 形态，并给出可直接照抄的示例行——实测这能减少
DSML 乱码刷屏。

测试增至 59 项：空响应守卫的 4 种结局（空/正文/工具/native 调用）、守卫开关、
丢弃空回合及其开关、目录逐字节确定性、`includeSchemas` 前后差异、DSML 禁写与示例行。

## 未发版 — 2026-11-05（语法扩容 + 自动降级 + 宽容闭合）

实测 n1n 网关下 8 个模型的文本协议遵从度后补齐（`scripts/_proto_probe.mjs`）：

| 模型 | 实测输出 | 结论 |
| --- | --- | --- |
| `deepseek-v4.1-flash`、`glm-5.3-flash`、`kimi-k3.1-pro`、`qwen3.8-flash`、`mimo-v2.6-flash` | `@@TOOL@@ {…}` | 正常 |
| `qwen3.8-max-0902` | `<tool_call>{"name":…}</tool_call>` | 新解析器支持 |
| `mimo-v2.6-pro` | `<tool_call><function=…><parameter=…>` | 新解析器支持 |
| `glm-5.3` | 残缺 `<tool_call>read file_path="…"</arg_value>` | 不可用，自动降级 |
| `kimi-k3` | 空内容 | 不可用 |

- 新增 `<tool_call>` 方言解析 `extractToolCallBlock()`：同时支持 JSON 信封体与
  `<function=NAME><parameter=K>V</parameter></function>` 标签体；参数类型按出站时捕获的
  Schema 强转，`limit` 不会再退化成字符串。
- `extractInvokeCall()` 改为边界扫描，容忍模型把闭合标签写坏（用 `｜DSML｜>` 顶替规范写法）。
- 新增 `autoDetect` 自动检测：回复里出现工具调用语法却没解析出调用时，立刻把该
  provider/model 路由降级为原生 `tools`，本进程后续不再改写它。
- 新增 `denyModels` 黑名单（优先级高于 `models`）与 `parseStrippedRoutes` 兜底：
  请求没有 `tools` 字段时仍然解析回复，避免"漏出标记后整轮停住"。
- **修复闸门认不出路由**：`installModelSelection` 只在用户**显式选过模型**时才写
  `variables.provider`；会话停在默认模型时它是空的，于是插件把自己拒绝掉、退回原生 tools。
  路由解析改为三级兜底：`variables` → `context.agent.session.requestHeader().config`
  （上一跳真实路由）→ `agent.options`，仍认不出就继续走原生。
- 测试增至 45 项。

## 1.0.0 — 2026-11-05

初始版本（原名 `dsh-prompt-tools`，因只针对 n1n 网关而改名为 `dsh-n1n-prompt-tools`）。

- 出站 `system-prompt/assemble`：把工具清单（名字排序 + 递归排序 Schema 键）确定性渲染进系统提示词，
  并清空 `assembly.tools`，请求体不再发送 native `tools` 字段。
- 入站 `llm/stream`：把模型输出的文本调用解析回标准 `tool-call` 块。支持两种语法：
  - `@@TOOL@@ {"name":..,"arguments":..}`；
  - XML invoke 形式 `<｜DSML｜ invoke name=".."><｜DSML｜ parameter name=".." string="true">..</｜DSML｜ parameter>…`（模型原生工具语法漏进文本时）。
  两种都支持跨 chunk、字符串内花括号与转义、代码围栏、多个调用、参数扁平写在 `name` 同级、
  未完成调用回落为文本。
- 按 provider 白名单生效（默认 `['n1n']`，空数组 = 全部）；`enabled` 总开关；`marker` 可配。
- 22 项单元测试。

### 供应商硬限制

- 插件**永远不会**作用于 `n1n` 以外的 provider：
  - `resolveOptions` 把 `providers` 过滤成只保留 `'n1n'`，配置里混入其它 provider 会被丢弃；
  - `routeAllowed` 要求 provider 为非空字符串且严格等于 `'n1n'`，`undefined`/空串/`N1N` 全部拒绝；
  - 出站与入站两个水位各自独立校验，任一侧认不出路由就回退原生 `tools`。
- **移除了"`providers: []` = 全部 provider"的语义**：空数组现在表示完全不生效。
- 新增可选 `models` 白名单用于在 n1n 内部按模型收窄（`glm-5.3` 不遵循文本协议，需要它时应排除）。
- 测试增至 30 项，其中 8 项专门覆盖这道硬限制（含 3 项直接跑 `apply()` 两个 hook 的端到端断言）。
