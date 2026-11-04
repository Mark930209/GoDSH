# Changelog

本文件记录所有值得注意的变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。
**版本策略：只有用户明确要求发版时才 bump / 打 tag / 建 Release。**

## [1.0.1] - 2026-11-04

### Changed

- 包名从 `@local/file-tree-context-menu` 改为公开 npm 包名 **`dsh-file-tree-context-menu`**，
  去掉 `private`，可直接 `npm i dsh-file-tree-context-menu` 或在 DSH 的 npm 安装页填包名。

## [1.0.0] - 2026-11-03

### Added

- 文件树 / 交付物列表右键菜单：加入对话（引用芯片，失败回退 `@路径` 文本）、复制 @ 引用、复制绝对/相对路径、复制名称。
- 复制 `file://` 链接与 Markdown 链接。
- 在 DSH 右侧面板中预览文件（`sidebarRight.openResource`）。
- 用 AI 总结 / 用 AI 解释：把文件引用与现成提问填入输入框，按 Enter 即发送。
- 新建文件、新建文件夹、重命名、删除（移到 Windows 回收站），由 Host 路由 `POST /api/ftcm.fileops` 处理。
- 在终端中打开当前文件夹（或文件所在目录）。
- 多选：Ctrl/Cmd 点选、Shift 连选，批量加入对话或复制路径；普通单击清空选择。
- 本机打开能力（复用 Session Remote `openWorkspacePath` / `workspacePathApplications`）：
  - 「用默认应用打开」：文件交给系统默认程序，HTML 等网页文件即默认浏览器；文件夹在文件管理器中打开。
  - 「在文件夹中显示」：在资源管理器中定位并选中目标文件/文件夹。
  - 「用浏览器打开」：对 `html/htm/xhtml/shtml/svg` 自动挑选 Chrome / Edge / Firefox 等浏览器。
- 支持交付物列表右键：交付文件卡片、改动文件卡片、审阅侧边栏文件选择按钮。
- 中英双语、跟随系统语言与主题；复制成功反馈「已复制」。

### Changed

- **版本号重置为 1.0.0**：用户要求当前统一从 1.0 开始，以后只有明确要求才发版；旧 1.1.0 / 1.2.0 编号与 tag 已废弃并清理。
- 移除「打开方式…」二级菜单（用户明确不需要）。
- `package.json` 的 `dsh.client.inject` 增加 sidebar-right 依赖，Host 侧 `inject = ['connection']`。
- 菜单样式支持内联表单、危险操作按钮、多选高亮与超长列表滚动。

### Historical

- 2026-11-02：初版右键菜单（加入对话、复制路径）。
- 2026-11-03：引用芯片 / 交付物列表 / 本机打开等迭代，曾使用 1.1.0、1.2.0 编号；现统一归入 1.0.0。
