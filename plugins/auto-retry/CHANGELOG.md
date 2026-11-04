# Changelog

本文件记录所有值得注意的变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。
**版本策略：只有用户明确要求发版时才 bump / 打 tag / 建 Release。**

## [1.0.1] - 2026-11-04

### Changed

- 包名从 `@local/auto-retry` 改为公开 npm 包名 **`dsh-auto-retry`**，去掉 `private`，
  可直接 `npm i dsh-auto-retry` 或在 DSH 的 npm 安装页填 `dsh-auto-retry`。

## [1.0.0] - 2026-11-03

### Added

- Host-only 策略插件：某一轮运行失败后自动重试 / 续跑。
- 第 1 层 `agent/request-error`：模型请求按指数退避 + 抖动延后重试，同一步内不重复追加用户消息；
  尊重服务端 `providerRetryAfterMs`，按 `turn:step` 计数到 `maxRequestRetries` 为止。
- **可见的重试提示**：重试前写入 `llm/retry`、等待结束时写入 `llm/retry-started` 会话事件，
  对话里出现「正在重试模型请求（1/6） · 3s」这行（复用宿主 `RetryNodeView`，带倒计时、
  可展开看失败原因与延迟，停止后显示「已取消」）。同一 `turn/step` 共用 `retryId`，
  多次重试在同一行累加。会话事件不消耗 token；`session.append` 抛错也不会取消重试。
- 第 2 层 `turn/end`（`error`）：整轮仍失败时延时 `followup` 一条 `<auto_resume>` 续跑提示，
  连续失败计数到 `maxConsecutiveResumes` 为止；`completed` / `aborted` / `blocked` 轮次清零预算。
- 失败分类：5xx 与 408/409/425/429 视为可重试；`AUTH` / `API_KEY` / `QUOTA` / `INSUFFICIENT` /
  `CONTEXT_LENGTH` / `CONTENT_FILTER` / `NO_ADAPTER` 等不可重试的 code 优先于状态码判定。
- 安全边界：用户停止不触发续跑；用户自己发消息取消待续跑（`pauseOnUserInput`）；
  agent 忙碌或已销毁时跳过续跑；插件卸载时清空所有待发定时器。
- 全部参数可在 `cordis.patch.yml` 的 `config` 中调整，含自定义 `continuationPrompt`。
- 中英双语 `locale` 元数据、原创图标。
- `test/` 用假 Cordis 上下文重放真实事件负载，11 项行为测试全部通过。
