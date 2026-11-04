# Changelog

本文件记录所有值得注意的变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。
**版本策略：当前固定 1.0.0，只有用户明确要求发版时才 bump / 打 tag / 建 Release。**

## [1.0.0] - 2026-11-03

### Added

- 输入框工具行（`+` 右侧）常驻一个「技能」下拉框（`conversation.input.left`，order 80），
  样式对齐内置模型选择器（原生 `<select>`、透明底、28px、右侧 chevron、主题配色）。
- 打开会话即自动发现**当前项目**的自定义技能：
  `<项目>/.dsh/skills`（`project-dsh`）与 `<项目>/.agents/skills`（`project-agents`），
  按名字排序，无需手工配置清单。
- 选中即把 `/技能名 ` 插回草稿的光标处（`inputActions.captureInsertion` + `insertText` 的
  CAS 守卫，失败退回最新光标位置），随后把焦点交还输入框；由宿主按 skill 解析，不提交消息。
- 下拉框自带加载 / 空 / 失败三态（「技能加载中…」「当前项目没有技能」「技能加载失败」），
  无技能时禁用。
- 中英双语（`locale/{zh,en}.json` + 运行时 `ctx.locale` 字典），跟随主题变量配色。
- 子代理会话不提供候选。
- **修复（1.0.0 内）**：`skills/list` 的返回条目没有 `source` 字段，最初按 `source` 过滤导致
  列表永远为空（显示「当前项目没有技能」）；改为按段（`.agents/skills` / `.dsh/skills`）之前的
  目录前缀与会话 cwd 比较来判定项目归属，用户级 `<home>/.agents/skills` 正确排除。

### Changed（1.0.0 内）

- **改为「短按钮 + 浮层面板」**：工具行只留一个紧凑按钮（`max-width:96px`），面板挂在
  `shell.overlay`（`position:fixed`，贴按钮上方），宽度 420px、列表区独立滚动，
  长技能名可横向滚动——解决原生 `<select>` 无法加宽、长名字被截断的问题。
- **面板加复选框**：项目技能（默认勾选）/ 全局技能，实时过滤列表并显示各类数量。
- ~~Agent 支持~~：曾按 `agentPresets/list` + `agentPresets/select` 实现，但宿主只允许在会话首轮
  之前切换（`agent-preset/locked`），且 DSH 不读取 `.github/agents/*.agent.md`；按用户要求
  已移除「Agent」复选框与相关代码。
- **修复归类**：没有 `path` 的条目（随包内置的 `office-*`、`diagnose-windows-sandbox-acl` 等）
  此前被误判为项目技能；现在要求 `path` 必须落在 cwd 或其祖先目录下的
  `.agents/skills` / `.dsh/skills` 才算项目技能，其余归「全局技能」并标注「内置 / 用户」。
- 面板背景改用 `--dsw-alias-bg-layer-1`（浅色主题下为纯白）+ `--dsw-alias-border-l2` 边框，
  不再用偏灰的 `--dsw-alias-bg-overlay`。

### Notes

- 不提供 Agent 切换：DSH 的 agent preset 是会话级选择，首轮之后即锁死；项目里的自定义
  agent 表现为 `.agents/skills/<名字>/SKILL.md` 技能。
- 早期设计曾用「按钮 + commandUi popupSelect 搜索弹窗」「常驻原生 `<select>`」与
  「三复选框（含 Agent）」三版，均已按用户反馈替换。
