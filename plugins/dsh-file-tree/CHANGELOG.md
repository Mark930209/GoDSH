# Changelog

本文件记录所有值得注意的变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。
**版本策略：只有用户明确要求发版时才 bump / 打 tag / 建 Release。**

## [Unreleased]

### Added

- 文件树 Git 状态：Host 读取 `git status --porcelain=v2 --branch --ahead-behind -z --untracked-files=all`，
  客户端给已修改 / 新增 / 已删除 / 未跟踪 / 重命名 / 已复制 / 冲突的行着色并加字母徽标，
  目录按子项聚合；菜单顶部显示分支（或游离 HEAD / 合并、变基、拣选等操作）、改动数、
  领先/落后远程的提交数，以及当前文件/目录的暂存状态。
- 文件页头新增分支胶囊：分支名 + `↑N`（未推送，橙）/ `↓N`（未拉取，蓝）/ `✓`（已同步）/
  `◎`（无上游分支）；点击强制刷新，右键打开该工作区的 Git 菜单。Host 快照新增
  `hasUpstream`/`upstream` 字段，用于区分「已同步」与「从未推送」。
- 工作区根目录菜单：右键页头胶囊（或树根）只给「新建文件/文件夹、打开/定位目录、
  复制根路径、刷新 Git 状态」，不提供重命名、删除与加入对话。
- 刷新策略：窗口聚焦、菜单打开、页头胶囊点击、切换会话工作区、文件操作后立即刷新，
  平时 20 秒轮询；非 Git 仓库静默不显示。
- 新增 Host 路由 `POST /api/dft.git`；Git 调用带 15 秒超时、4 MB 输出上限，并设置 `GIT_OPTIONAL_LOCKS=0` 与 `GIT_LITERAL_PATHSPECS=1`。

### Removed

- 移除右键菜单里的「复制 file:// 链接」：该形式在 Windows 中文路径、浏览器安全策略和
  外部程序里的实际可用性都很差，保留反而增加误点；需要外部可点击地址时用「复制 Markdown 链接」
  或「复制绝对路径」。对应的 `fileUrlOf` 辅助函数与 `menu.copyFileUrl` 文案一并删除。

### Changed

- 包名与目录从 `dsh-file-tree-context-menu` 重命名为 **`dsh-file-tree`**；
  模块 id、locale 命名空间、CSS 前缀、Host 路由与 `cordis.patch.yml` 同步更新。
- 定位从「文件树右键菜单」改为「文件树增强」：市场标题改为「文件树增强 / File Tree Enhancements」，
  说明以文件树 Git 视图为主、右键菜单为辅。
- 本版本未发版、未 bump 版本号、未刷新市场索引。

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
- 新建文件、新建文件夹、重命名、删除（移到 Windows 回收站），由当时的 Host 路由 `POST /api/ftcm.fileops` 处理（现已改为 `/api/dft.fileops`）。
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
