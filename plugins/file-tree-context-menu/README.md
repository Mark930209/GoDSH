# File Tree Context Menu · 文件树右键菜单

给 DeepSeek Harness Web UI 的工作区**文件树**与**交付物列表**加右键菜单：

| 菜单项 | 行为 |
|---|---|
| 加入对话 | 在输入框光标处插入**引用芯片**（与内置 `@` 选文件一致）；芯片不可用时回退为 `@路径` 纯文本并提示「已插入文本（非芯片）」 |
| 复制 @ 引用 | 复制 `@相对路径`（与引用芯片的剪贴板格式一致，可直接粘贴进对话） |
| 复制绝对路径 | 原生 Windows 形式，如 `E:\repo\Modules\a.cpp` |
| 复制相对路径 | 相对会话工作区根目录、`/` 分隔 |

支持右键的位置：文件树行、交付文件卡片、`已编辑 N 个文件` 改动卡片、审阅侧边栏的文件选择按钮。
（限制：审阅页的**下拉菜单项**本身不携带路径信息，不在支持范围。）

## 安装

方式一（本地目录，已装 DSH 桌面端）：

```
# Web 侧边栏 → Plugins → 安装外部 bundle，或让 agent 调用
install_bundle  target = <本目录绝对路径>
```

方式二（从 Git 安装，推荐给其他机器）：

```
git+https://github.com/<user>/dsh-plugins.git#<40位commit>&path:/plugins/file-tree-context-menu
```

方式三（从 npm 安装，需先发布）：`包名@版本`。

> **改动生效**：本 bundle 以 `link:` 方式安装，修改 `client.js` 后**重启 DeepSeek Harness** 即可加载新代码
> （替换已安装的包必须重启才会加载新一代 JS 模块，仅刷新页面不一定够）。

## 目录结构

```
client.js              客户端插件（右键菜单、路径提取、引用插入）
index.js               Host 半部（空 apply）
cordis.patch.yml       bundle patch（插入本插件的行）
package.json           清单：exports / dsh.bundle.patch / dsh.client
locale/{zh,en}.json    插件市场与管理页展示用的标题/描述
icon.svg               插件图标（原创）
scripts/               市场索引生成脚本
docs/                  生成的市场索引（供 GitHub Pages 托管）
PUBLISHING.zh.md       发布指南
MAINTENANCE.zh.md      维护手册（版本、发布、迁移、回滚）
CHANGELOG.md           版本记录
```

## 开发要点

- 行身份来自**宿主自己的稳定标记**，不猜类名：文件树 `li[data-files-entry][data-files-path]`；交付卡片 `[data-presented-file]`；
  改动卡片 `div[data-changed-files]`（`aria-describedby` 隐藏 span）；审阅页 `[data-review-file]`。
- 插入芯片走公开事件 `slash/input-insert-reference`（会话作用域 ctx 的 `bail`），span 来自公开的
  `inputActions.captureInsertion()`（CAS 语义，失败自动回退纯文本）。
- 只依赖宿主提供的 React 与标准 slot props，**无第三方运行时依赖**。

## 许可

MIT，见 [LICENSE](LICENSE)。
