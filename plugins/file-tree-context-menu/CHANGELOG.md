# Changelog

本文件记录所有值得注意的变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.1.0] - 2026-11-03

### Added

- 「加入对话」优先插入**引用芯片**：走会话作用域事件 `slash/input-insert-reference`
  （`sessions.scope(id).bail(...)`，span 来自 `inputActions.captureInsertion()` 的 CAS 位点）；
  失败时回退纯文本，并在菜单项上显示「已插入文本（非芯片）」，控制台输出 `[file-tree-context-menu]` 诊断。
- 支持**交付物列表**右键：交付文件卡片、改动文件卡片、审阅侧边栏文件选择按钮。
- 从标准 slot props 捕获 `sessionId` 与工作区 `cwd`，用于把交付物路径归一为 `@相对路径`。

### Changed

- 菜单打开时的路径解析改为多来源 `resolveHit`（文件树 / 交付卡片 / 改动卡片 / 审阅页）。

## [1.0.0] - 2026-11-02

### Added

- 文件树右键菜单：加入对话（纯文本 `@路径`）、复制 @ 引用、复制绝对路径、复制相对路径。
- 中英双语、跟随系统语言与主题；复制成功反馈「已复制」。
- bundle 清单、图标、locale 展示资源。
