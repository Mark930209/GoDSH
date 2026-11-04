# dsh-auto-retry · 自动重试与续跑

某一轮运行失败后自动恢复，直到任务完成或达到次数上限。**Host-only 策略插件**，没有自己的 UI 界面；重试时复用宿主的重试提示行。

## 解决什么问题

DSH 的默认行为是：一次模型请求失败就结束当前轮次，agent 回到 idle，需要人工再发一句「继续」。模型服务抖动、限流、超时、连接被重置时，这会让长任务反复中断。

本插件加两层恢复：

| 层 | 监听 | 做什么 | 覆盖场景 |
|---|---|---|---|
| 1 | `agent/request-error` | 失败的**模型请求**按指数退避延后重试（同一步内，不重新追加用户消息，因此不会重复副作用） | 限流 429、过载 503、超时、连接重置、流中断、其它 5xx |
| 2 | `turn/end`（`reason.kind === 'error'`） | 整轮仍然失败时，延时后在同一会话 `followup` 一条 `<auto_resume>` 续跑提示 | 上面的重试额度用尽，或非模型类失败（工具/插件/持久化异常） |

预算与安全边界：

- 第 1 层按 `turn:step` 计数，超过 `maxRequestRetries` 就不再重试，让失败正常落地。
- 第 2 层计数**连续**失败轮次；任意一次 `completed` / `aborted` / `blocked` 轮次结束都会把预算清零。用尽后彻底停止，不再干扰。
- 用户按下停止（`aborted`）**不会**触发续跑；用户在待续跑期间自己发消息，会取消已排队的续跑（`pauseOnUserInput`）。
- 鉴权类、额度类、上下文超长、内容过滤等「重试也没用」的失败（`AUTH` / `API_KEY` / `QUOTA` / `INSUFFICIENT` / `CONTEXT_LENGTH` / `CONTENT_FILTER` …）两层都不动作。

## 界面上会看到什么

| 阶段 | 你看到的 |
|---|---|
| 模型请求失败、正在等待重试 | 对话里出现一行可展开的提示：**`正在重试模型请求（1/6） · 3s`**，带倒计时；展开可见 `重试延迟：` 与 `失败原因：`（例如 `socket closed`） |
| 等待结束、请求已重新发出 | 同一行变成 **`已重试模型请求`** |
| 重试次数用完仍失败 | 提示行（若仍在同一轮内）以及随后的整轮失败 |
| 自动续跑 | 对话里多出一条**用户消息**：`<auto_resume>…第 N/M 次自动续跑…</auto_resume>`，agent 接着干活 |
| 你在等待期间按了停止 | 该提示行显示 **`模型请求重试已取消`** |

这行提示复用宿主 `@deepseek-ai/dsh-llm-retry` 已有的渲染组件：插件写入 `llm/retry` /
`llm/retry-started` 会话事件即可，**不消耗模型 token**（是会话事件，不是消息）。
同一个 `turn/step` 内的多次重试共用一条 `retryId`，所以会在同一行里累加，而不是刷屏。

此外每次重试/续跑都会写一条 Host 日志：`[auto-retry] agent "…": model request failed (…); retry 1/6 in 2000ms`。

## 配置

配置写在 `cordis.patch.yml` 的本插件行里（也可以让 DSH 的配置层覆盖）：

```yaml
- insert:
    - id: auto-retry
      name: 'dsh-auto-retry'
      config:
        enabled: true
        maxRequestRetries: 6
        initialRetryDelayMs: 2000
        maxRetryDelayMs: 60000
        jitterRatio: 0.2
        resumeAfterFailure: true
        maxConsecutiveResumes: 5
        initialResumeDelayMs: 5000
        maxResumeDelayMs: 120000
        pauseOnUserInput: true
        continuationPrompt: ''
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | 总开关；关闭后插件不产生任何行为 |
| `maxRequestRetries` | `6` | 同一步内模型请求最多重试次数（`0` 关闭第 1 层） |
| `initialRetryDelayMs` | `2000` | 首次重试延时 |
| `maxRetryDelayMs` | `60000` | 单次重试延时上限 |
| `jitterRatio` | `0.2` | 退避抖动比例（0–1），避免多会话同时重试 |
| `resumeAfterFailure` | `true` | 是否启用第 2 层续跑 |
| `maxConsecutiveResumes` | `5` | 连续续跑上限（`0` 关闭第 2 层） |
| `initialResumeDelayMs` | `5000` | 首次续跑延时 |
| `maxResumeDelayMs` | `120000` | 单次续跑延时上限 |
| `pauseOnUserInput` | `true` | 用户自己发消息时取消已排队的续跑 |
| `continuationPrompt` | `''` | 自定义续跑提示；留空用内置 `<auto_resume>` 模板 |

`providerRetryAfterMs`（服务端给的 Retry-After）优先于本地退避，但不会超过 `maxRetryDelayMs`。

## 安装

```text
plugin_manager install_bundle target=E:\Projects\DSH_Plugins_Dev\plugins\auto-retry
```

安装后重启 DeepSeek Harness 生效。Host 侧只用公开服务与事件（`ctx.agents`、`agent/*`、`session/event`），不 import 任何 `@deepseek-ai/*` 包，因此不会随宿主内部重构而崩。

## 与 goal 的分工

DSH 自带的 goal（`/goal`）负责「任务没做完，继续下一轮」；本插件负责「这一轮**失败**了，恢复」。两者互补：

- 长目标用 goal 驱动多轮推进；
- 本插件保证单轮不会因为一次服务抖动而中断，并在真失败后把会话拉回工作状态。

## 验证

```powershell
cd E:\Projects\DSH_Plugins_Dev\plugins\auto-retry
node --check index.js
node --test test\auto-retry.test.mjs
```

`test/` 用假的 Cordis 上下文重放真实事件负载，覆盖可重试/不可重试分类、重试预算、续跑预算、用户干预取消、忙碌或已销毁的 agent 等 11 项行为。

## 已知限制

- 重试期间该轮请求会一直处于「运行中」，最长可达 `maxRetryDelayMs`；这是有意为之，UI 上表现为等待。
- 续跑只在 agent `idle` 时排队；若此时该会话已有别的工作在跑，则跳过本次续跑，不叠加提示。
- 不做 token / 费用 / 时间预算，只按次数收敛。
- 不尝试判断「任务是否真的完成」——那是模型与 goal 的职责，本插件只负责把失败的轮次拉起来。

## License

MIT © 2026 Mark930209
