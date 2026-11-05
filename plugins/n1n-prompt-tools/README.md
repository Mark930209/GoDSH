# dsh-n1n-prompt-tools

**只针对 n1n 网关。** 把工具清单从请求的 native `tools` 字段搬进（可缓存的）系统提示词，
再把模型输出的文本工具调用解析回标准 tool-call 块。目标是让 n1n 前缀缓存（prefix cache）
能稳定增长，而不是因为庞大的 `tools` 字段反复从头重算（在 `deepseek-v4.1-flash` 上实测有效）。

> 该插件按 provider 白名单生效，默认 `providers: ['n1n']`；对其它 provider 不生效，
> 因为有些模型（如 `glm-5.3`）根本不遵循文本协议，而原本能正确缓存 `tools` 的 provider
> 也不该被改写。

## 工作原理

Host 插件，挂两个水位（waterfall）事件，不需要任何 `@deepseek-ai/*` 依赖：

1. **出站** `system-prompt/assemble`
   - 收集本次装配的工具（跳过 `deferLoading`），按名字排序、递归排序 JSON Schema 的键，
     渲染成一段**确定性**文本：工具名、描述、参数 JSON Schema，以及调用协议。
   - 作为新 section（`interpolate: false`）追加到系统提示词末尾。
   - 把 `assembly.tools` 清空 → 适配器不再发送 `tools` 字段。

2. **入站** `llm/stream`
   - 模型按协议在普通文本流里输出工具调用。接受**两种**语法（模型会在两者间漂移）：
     - 文档协议：`@@TOOL@@ {"name":"<工具名>","arguments":{...}}`
     - XML 形式（模型把原生 `invoke` 语法漏进文本时）：
       `<｜DSML｜ calls><｜DSML｜ invoke name="read"><｜DSML｜ parameter name="path" string="true">a.txt</｜DSML｜ parameter></｜DSML｜ invoke>`
   - 本层跨 chunk 缓冲文本：能安全判定时立即以 `text-delta` 流式下发；只在尾部可能构成
     调用/标签时才保留少量字节。
   - 当调用完整（字符串/转义感知、跨 chunk 拼装、容忍代码围栏、容忍参数被扁平写在
     `name` 同级）后，改发标准 `block-start` / `tool-call-delta` / `block-end` 工具调用块，
     其余循环（执行、结果回填、UI 渲染）完全不变。

## 供应商硬限制（不可绕过）

这个插件**只会作用于 `provider === 'n1n'` 的路由**，代码里做了三重兜底：

1. `resolveOptions()` 把 `providers` 过滤成**只保留 `'n1n'`**——即使有人把配置写成
   `providers: ['n1n', 'strata', 'deepseek']`，其它 provider 也会在解析阶段被丢弃。
2. `routeAllowed()` 要求 provider 必须是**非空字符串且严格等于 `'n1n'`**，
   否则直接放行原生工具调用。`undefined` / 空串 / 大小写不一致（`N1N`）一律拒绝。
3. 两个水位各自独立校验：出站看 `assembled.variables.provider`（`installModelSelection`
   写入），入站看请求体里冻结的 `request.provider`。任意一侧认不出路由，就走原生 `tools`。

**不存在"空数组 = 全部生效"的开关**：`providers: []` 只会让插件什么都不做。

## 配置

`cordis.patch.yml` 的 `config`：

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `providers` | `['n1n']` | 只会保留 `'n1n'`；写其它值会被丢弃。空数组 = 完全不生效 |
| `models` | `[]` | 可选白名单，按模型收窄；空数组 = n1n 下所有模型 |
| `denyModels` | `[]` | 可选黑名单，永远走原生 `tools`；优先级高于 `models` |
| `autoDetect` | `true` | 回复里出现调用语法却没解析出调用时，自动把该路由降级为原生 `tools` |
| `parseStrippedRoutes` | `true` | 请求没有 `tools` 字段时仍解析回复，避免漏标记后整轮停住 |
| `marker` | `'@@TOOL@@'` | 文本调用标记 |

### n1n 内部的模型差异（2026-11-05 实测）

用真实请求（工具清单在系统提示词里、请求不带 `tools`）逐个验证：

| 模型 | 实测输出 | 文本协议 |
|---|---|---|
| `deepseek-v4.1-flash` | `@@TOOL@@ {…}` | 可用 |
| `glm-5.3-flash` | `@@TOOL@@ {…}` | 可用 |
| `kimi-k3.1-pro` | `@@TOOL@@ {…}` | 可用 |
| `qwen3.8-flash` | `@@TOOL@@ {…}` | 可用 |
| `mimo-v2.6-flash` | `@@TOOL@@ {…}` | 可用 |
| `qwen3.8-max-0902` | `<tool_call>{"name":…}</tool_call>` | 可用（靠 `<tool_call>` 解析器） |
| `mimo-v2.6-pro` | `<tool_call><function=…><parameter=…>` | 可用（同上） |
| `glm-5.3` | 残缺 `<tool_call>read file_path="…"</arg_value>` | 不可用，自动降级 |
| `kimi-k3` | 空内容 | 不可用 |

注意"是否支持图像输入"与"是否遵循文本协议"**没有相关性**：`qwen3.8-max-0902`
支持图像却不认文本协议，而纯文本的 `glm-5.3-flash` 反而认。所以默认不要按模态配白名单，
交给 `autoDetect` 自动判断；确实要钉住时再显式收窄：

```yaml
config:
  enabled: true
  providers: ['n1n']
  models: ['deepseek-v4.1-flash', 'kimi-k3.1-pro']
```

## 安装（本机开发）

用 `plugin_manager install_bundle`，`target` 传插件包绝对路径（或 Web 侧边栏 Plugins 页）。
源码在本仓库 `plugins/n1n-prompt-tools/`，安装目录只作部署目标（`link:`）。

## 测试

```powershell
cd plugins\n1n-prompt-tools
node --check index.js
node --test test/n1n-prompt-tools.test.mjs
```

30 项单元测试覆盖：确定性渲染、marker 跨 chunk、JSON 跨 chunk、字符串内花括号与转义、
代码围栏、多个调用、reasoning 透传、空文本块丢弃、扁平参数容错、XML invoke 块（含跨 chunk、
多调用、代码围栏、未闭合回落）、未完成调用回落文本，以及**供应商硬限制**（默认只允许 n1n、
空数组不生效、混合列表被过滤、`models` 收窄、未知路由拒绝，含 3 项直接跑 `apply()` 两个
hook 的端到端断言：非 n1n 路由的 `tools` 数组原样返回、请求不被包装）。

## 协议一致性（实测，2026-11-05）

用 `deepseek-v4.1-flash`（llm-api.net）实测：系统提示词内放工具清单、请求体不带 `tools`，
模型会输出 `@@TOOL@@ {"name":"read","file_path":"a.txt"}`，解析为 `read({"file_path":"a.txt"})`
正确；模型有时会改用 XML invoke 语法，本插件同样能解析。

## 已知边界与实测结论

- **不是万能药**：受控 A/B 显示 `tools` 字段本身并非真实长会话缓存塌陷的唯一/主要成因
  （更像网关多后端随机整步未命中）；本插件保证请求是一个连续、确定性的文本前缀，是稳定前缀
  缓存的前提。若网关本身不做粘性路由，仍需从 provider 侧解决。
- 依赖模型遵循文本协议：完全不遵循的模型会退化为“不调用工具”；因此按 provider 白名单生效。
- 工具清单变化（技能增删工具）会改变系统提示词那一行 → 该步会重写系统消息前缀，属预期。
