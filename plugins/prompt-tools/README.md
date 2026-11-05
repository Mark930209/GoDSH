# dsh-prompt-tools

把工具清单从请求的 native `tools` 字段搬进（可缓存的）系统提示词，再把模型输出的
`@@TOOL@@` 文本调用解析回标准 tool-call 块。目标是让 OpenAI 兼容网关的前缀缓存
（prefix cache）能稳定增长，而不是因为庞大的 `tools` 字段反复从头重算。

## 工作原理

Host 插件，挂两个水位（waterfall）事件，不需要任何 `@deepseek-ai/*` 依赖：

1. **出站** `system-prompt/assemble`
   - 收集本次装配的工具（跳过 `deferLoading`），按名字排序、递归排序 JSON Schema 的键，
     渲染成一段**确定性**文本：工具名、描述、参数 JSON Schema，以及调用协议。
   - 作为新 section（`interpolate: false`）追加到系统提示词末尾。
   - 把 `assembly.tools` 清空 → 适配器不再发送 `tools` 字段。

2. **入站** `llm/stream`
   - 模型按协议在普通文本流里输出
     `@@TOOL@@ {"name":"<工具名>","arguments":{...}}`。
   - 本层跨 chunk 缓冲文本：能安全判定时立即以 `text-delta` 流式下发；只有在尾部可能构成
     marker 时才保留少量字节。
   - 当 JSON 对象完整（字符串/转义感知、跨 chunk 拼装、容忍代码围栏、容忍参数被扁平写在
     `name` 同级）后，改发标准 `block-start` / `tool-call-delta` / `block-end` 工具调用块，
     其余循环（执行、结果回填、UI 渲染）完全不变。

## 配置

`cordis.patch.yml` 的 `config`：

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `providers` | `['n1n']` | 生效的 provider id 列表；**空数组 = 全部 provider**。默认只作用于报告缓存问题的 n1n 网关，避免影响其它已能正确缓存 `tools` 的 provider |
| `marker` | `'@@TOOL@@'` | 调用标记 |

换成别的网关，例如全量启用：

```yaml
config:
  enabled: true
  providers: []
  marker: '@@TOOL@@'
```

## 安装（本机开发）

```powershell
# Web 侧边栏 Plugins 页，或：
# plugin_manager install_bundle，target 传插件包绝对路径
```

源码在本仓库 `plugins/prompt-tools/`，安装目录只作部署目标（`link:`）。

## 测试

```powershell
cd plugins\prompt-tools
node --check index.js
node --test test/prompt-tools.test.mjs
```

15 项单元测试覆盖：确定性渲染、marker 跨 chunk、JSON 跨 chunk、字符串内花括号与转义、
代码围栏、多个调用、reasoning 透传、空文本块丢弃、扁平参数容错、未完成调用回落文本等。

## 协议一致性（实测，2026-11-05）

用 `deepseek-v4.1-flash`（llm-api.net）实测：系统提示词内放工具清单、请求体不带 `tools`，
模型会输出
`@@TOOL@@ {"name":"read","file_path":"a.txt"}`，
解析为 `read({"file_path":"a.txt"})` 正确。模型倾向于把参数写在 `name` 同级（扁平），
解析器两种形式都接受。

## 已知边界与实测结论

- **不是万能药**：在本仓库的受控 A/B 里，`tools` 字段本身在 10K–50K 上下文下并未稳定压制
  缓存（native 与 tools-as-text 命中率差异在噪声内）；真实长会话（100K+）命中率塌陷更像
  网关多后端/缓存淘汰导致的**随机整步未命中**。本插件能保证请求是一个连续、确定性的文本前缀，
  是稳定前缀缓存的前提；若网关本身不做粘性路由，仍需从 provider 侧解决。
- 依赖模型遵循文本协议：不遵循的模型（例如个别模型会无视协议）会退化为“不调用工具”。
  该插件按 provider 白名单生效，默认只开给已验证的 n1n。
- 工具清单变化（技能增删工具）会改变系统提示词那一行 → 该步会重写系统消息前缀，属预期。
- 若宿主装配存在 “complete section” 覆盖全部 section 的预设，本插件追加的 section 会被宿主
  丢弃（此时工具也被清空会出问题）；当前 desktop profile 的预设不使用 complete section。
