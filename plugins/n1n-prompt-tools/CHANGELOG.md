# Changelog

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
- 测试增至 44 项。

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
