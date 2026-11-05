# Changelog

## 1.0.0 — 2026-11-05

初始版本。

- 出站 `system-prompt/assemble`：把工具清单（名字排序 + 递归排序 Schema 键）确定性渲染进系统提示词，
  并清空 `assembly.tools`，请求体不再发送 native `tools` 字段。
- 入站 `llm/stream`：把模型输出的 `@@TOOL@@ {"name":..,"arguments":..}` 文本调用解析回标准
  `tool-call` 块；支持 marker/JSON 跨 chunk、字符串内花括号与转义、代码围栏、多个调用、
  参数扁平写在 `name` 同级、未完成调用回落为文本。
- 按 provider 白名单生效（默认 `['n1n']`，空数组 = 全部）；`enabled` 总开关；`marker` 可配。
- 15 项单元测试。
