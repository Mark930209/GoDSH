# dsh-file-tree · 文件树增强

给 DeepSeek Harness Web UI 的文件树补上原生没有的 Git 视图，并在**文件树**与**交付物列表**上提供右键菜单：

| 功能 | 行为 |
|---|---|
| Git 改动着色 | 读取工作区的 `git status --porcelain=v2 --branch --ahead-behind -z --untracked-files=all`，按状态给文件名着色：已修改=橙、新增/未跟踪/已复制=绿、已删除/冲突=红、重命名=蓝；目录按子项聚合，混合时取最严重的一种 |
| Git 字母徽标 | 行内显示 `M/A/D/U/R/C/!` 小徽标；冲突加粗，悬停可看状态说明 |
| 分支与推送状态（页头） | 文件页头右侧一个胶囊：分支名 + `↑N`（本地有提交未推送，橙色）/ `↓N`（远程有提交未拉取，蓝色）/ `✓`（已同步）/ `◎`（无上游分支）；点一下立即刷新，点右键打开工作区菜单（Git 摘要 + 新建文件/文件夹 + 打开目录 + 刷新 Git 状态） |
| 菜单 Git 摘要 | 菜单顶部显示分支（或游离 HEAD / 合并、变基等操作）和改动数量、领先/落后远程的提交数，以及当前文件/目录的暂存状态 |
| 加入对话 | 在输入框光标处插入**引用芯片**（与内置 `@` 选文件一致）；芯片不可用时回退为 `@路径` 纯文本并提示「已插入文本（非芯片）」 |
| 复制 @ 引用 | 复制 `@相对路径`（与引用芯片的剪贴板格式一致，可直接粘贴进对话） |
| 用 AI 总结 / 用 AI 解释 | 把文件引用和现成提问填入输入框（不自动发送，按 Enter 即用） |
| 复制 Markdown 链接 | 复制 `[文件名](<相对路径>)`，相对路径优先 |
| 复制绝对路径 | 原生 Windows 形式，如 `E:\repo\Modules\a.cpp` |
| 复制相对路径 | 相对会话工作区根目录、`/` 分隔 |
| 复制名称 | 仅文件名/文件夹名 |
| 在 DSH 中预览 | 用 DSH 右侧预览面板打开该文件（复用 `ctx.sidebarRight.openResource`） |
| 用默认应用打开 | 外部程序打开：文件走系统默认关联（HTML 即默认浏览器），文件夹在文件管理器中打开 |
| 在文件夹中显示 | 在资源管理器中定位并选中该文件/文件夹 |
| 用浏览器打开 | 仅 `html/htm/xhtml/shtml/svg`：自动从系统关联里选择 Chrome / Edge / Firefox 等浏览器 |
| 在终端中打开 | 在目标文件夹（文件则其所在目录）启动 PowerShell；Host 侧 `spawn`，路径经环境变量传递，避免命令拼接 |
| 新建文件 / 新建文件夹 | 在当前文件夹内新建；在文件上右键则建在其所在目录 |
| 重命名 | 弹出内联输入框，只允许改同一目录下的名称 |
| 删除（移到回收站） | 二次确认后移到 Windows 回收站；文件夹会连同内容一起移动 |
| 多选批量加入对话 | 按住 Ctrl/Cmd 点选、Shift 连选后右键：批量加入对话、批量复制路径/引用 |
| 清空选择 | 清除多选高亮 |

> 本机打开/预览/终端依赖 DSH 桌面端能力；纯 Web 部署会隐藏相应分组。
> 文件操作走 Host 路由 `POST /api/dft.fileops`，Git 状态走 `POST /api/dft.git`；
> 文件操作严格限制在传入的工作区根目录内，Git 路由只读取传入的绝对目录，并带 15 秒超时和 4 MB 输出上限。

> 工作区根目录的菜单刻意只保留「新建 / 打开 / 复制根路径 / 刷新 Git」，不提供重命名、删除与加入对话——
> 根目录没有工作区相对名，改名或删除它也不该出现在文件树里。
>
> **未推送怎么看出来**：页头胶囊的 `↑N` 就是「本分支有多少提交还没推到上游」。
> 判定完全来自 `git status --porcelain=v2 --branch` 的 `branch.ab` 与 `branch.upstream`：
> 有上游且 `ahead` > 0 才显示橙色 `↑N`，所以已经推送完的分支不会误报；没有上游（从未 push 过、
> 或刚 `--unset-upstream`）显示 `◎` 而不是 `✓`，避免让人误以为"都推上去了"。

支持右键的位置：文件树行、交付文件卡片、`已编辑 N 个文件` 改动卡片、审阅侧边栏的文件选择按钮。
（限制：审阅页的**下拉菜单项**本身不携带路径信息，不在支持范围。）

## 多选怎么用

1. 在文件树里按住 `Ctrl`（macOS 为 `Cmd`）点击多个文件/文件夹；或点第一个后按住 `Shift` 点最后一个做连选。
2. 在任意一个已选行上右键，菜单顶部会显示「已选 N 项」；所选行都在同一工作区时，还会显示该工作区的 Git 分支与改动摘要。
3. 选「加入对话（N 项）」即可批量插入引用芯片；「复制已选路径」复制绝对路径（每行一个）。

普通单击任意位置会清空选择，不影响文件树原本的打开/展开行为。

## 安装

方式一（本地目录，已装 DSH 桌面端）：

```
# Web 侧边栏 → Plugins → 安装外部 bundle，或让 agent 调用
install_bundle  target = <本目录绝对路径>
```

方式二（从 Git 安装，推荐给其他机器）：

```
git+https://github.com/Mark930209/GoDSH.git#<40位commit>&path:/plugins/dsh-file-tree
```

方式三（从 npm 安装）：`@guimaxingtian/dsh-file-tree@1.1.2`。裸名 `dsh-file-tree` 会被 npm
的包名相似度检查拒收（已存在第三方包 `dsh-filetree`），所以 npm 包名带作用域；目录名、tag 前缀与
cordis 条目 id 仍是不带作用域的 `dsh-file-tree`。

> **改动生效**：本 bundle 以 `link:` 方式安装，修改 `client.js` / `index.js` 后**重启 DeepSeek Harness** 即可加载新代码
> （替换已安装的包必须重启才会加载新一代 JS 模块，仅刷新页面不一定够）。

## 版本策略

- 当前版本 **1.1.2**（npm `@guimaxingtian/dsh-file-tree`，tag `dsh-file-tree-v1.1.2`，commit `0faf870`）；**只有用户明确要求发版时才 bump 版本、打 tag、建 Release、刷新市场索引**。
- 日常修改只提交代码，不发版、不改版本号。
- 本插件从 `dsh-file-tree-context-menu` 更名为 **`dsh-file-tree`**；旧包名 `1.0.1` 保留在 npm，但不再更新。
- 更早的 1.1.0 / 1.2.0 编号（旧包名下）已废弃，相关 tag 与 Release 已清理。

## 目录结构

```
client.js              客户端插件（Git 着色/徽标/页头胶囊、右键菜单、多选、表单、引用插入）
index.js               Host 半部（POST /api/dft.fileops：新建/重命名/回收站/终端；POST /api/dft.git：Git 状态）
cordis.patch.yml       bundle patch（插入本插件的行）
package.json           清单：exports / dsh.bundle.patch / dsh.client
locale/{zh,en}.json    插件市场与管理页展示用的标题/描述
icon.svg               插件图标（原创）
CHANGELOG.md           版本记录
```

## 开发要点

- 行身份来自**宿主自己的稳定标记**，不猜类名：文件树 `li[data-files-entry][data-files-path]`；交付卡片 `[data-presented-file]`；
  改动卡片 `div[data-changed-files]`（`aria-describedby` 隐藏 span）；审阅页 `[data-review-file]`。
- 插入芯片走公开事件 `slash/input-insert-reference`（会话作用域 ctx 的 `bail`），span 来自公开的
  `inputActions.captureInsertion()`（CAS 语义，失败自动回退纯文本）。
- 预览使用 `ctx.sidebarRight.openResource(dsh-resource://file/session/...)`，地址按 Session 作用域编码。
- 本机打开调用 `ctx.remote.session.openWorkspacePath({ path, action })` 与 `workspacePathApplications({ path })`。
- 新建/重命名/删除/终端由 Host 路由处理，使用 Node `fs/promises` + `path`，删除走
  `Microsoft.VisualBasic.FileIO.FileSystem` 的 `SendToRecycleBin`。
- Git 状态由 Host 直接调用系统 `git`（`execFile`，`GIT_OPTIONAL_LOCKS=0`、`GIT_LITERAL_PATHSPECS=1`，
  15 秒超时、4 MB 上限），不依赖 `dsh-better-sidebar`；客户端整棵树共享一份状态、20 秒轮询，
  并在窗口聚焦、菜单打开、页头胶囊点击、切换会话工作区和文件操作后强制刷新。
- 页头胶囊注册在宿主的 `sidebar.right.tab.files.actions` 槽位（文件页头右侧），用独立的 slot id
  `dsh-file-tree.sync`，与只做桥接的 `ComposerBridge` 分开，互不影响。
- 只依赖宿主提供的 React 与标准 slot props，**无第三方运行时依赖**。

## 许可

MIT，见 [LICENSE](LICENSE)。
