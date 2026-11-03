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

### Notes

- 选择范围刻意**只含项目级来源**：用户级技能与 `customSkillDirs` 会再次变成一长串，
  需要时改 `client.js` 的 `PROJECT_SOURCES` 集合。
- 不涉及 agent preset 切换：DSH 的 agent preset 是会话级选择，只能在新建会话时通过
  hero 区的 preset 控件决定。
- 早期设计曾用「按钮 + commandUi popupSelect 搜索弹窗」，按用户要求改为常驻下拉框后已移除。
