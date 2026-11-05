# Changelog

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
- 测试增至 27 项，其中 5 项专门覆盖这道硬限制。
