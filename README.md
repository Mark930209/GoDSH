# GoDSH · DeepSeek Harness 插件仓库

自研 DSH 插件的**唯一源码来源**，一个插件一个目录（`plugins/<name>/`），各自独立版本与发布。

- 仓库：<https://github.com/Mark930209/GoDSH>
- 维护者：Mark930209 `<guimaxingtian@163.com>`
- 当前版本：`auto-retry` **1.0.2**、`composer-skill-picker` **1.0.1**、`dsh-file-tree` **1.1.2**（2026-11-06）

## 插件

| 插件 | 版本 | npm 包名 | 说明 |
|---|---|---|---|
| [auto-retry](plugins/auto-retry/) | 1.0.2 | `dsh-auto-retry` | Host-only 策略插件：模型请求失败按指数退避重试，整轮仍失败则延时自动续跑同一会话，直到任务完成或达到次数上限；重试时对话里显示「正在重试模型请求（n/6） · Ns」 |
| [composer-skill-picker](plugins/composer-skill-picker/) | 1.0.1 | `dsh-composer-skill-picker` | 输入框工具行常驻技能下拉框，自动发现项目技能（`.dsh/skills`、`.agents/skills`），选中即插入 `/技能名` |
| [dsh-file-tree](plugins/dsh-file-tree/) | 1.1.2 | `@guimaxingtian/dsh-file-tree`（npm 拒收裸名 `dsh-file-tree`；旧 npm：`dsh-file-tree-context-menu`） | 文件树增强：Git 改动着色/字母徽标/目录聚合，页头胶囊显示分支与**未推送/未拉取提交数**；右键菜单提供加入对话（引用芯片）、复制路径与链接、DSH 内预览、终端打开、AI 总结/解释、新建/重命名/回收站、多选批量 |

## 安装

三种装法任选，装完重启 DeepSeek Harness。**完整步骤见 [docs/install.md](docs/install.md)。**

**① npm（最省事）** — DSH 侧边栏 Plugins → npm 安装页 → 填包名：

```
dsh-auto-retry
dsh-composer-skill-picker
@guimaxingtian/dsh-file-tree
# 裸名 dsh-file-tree 被 npm 拒收（与已有的 dsh-filetree 过于相似），只能带作用域
```

**② git 规格（钉版本）**：

```powershell
git+https://github.com/Mark930209/GoDSH.git#12a89aad7f085ba23ea3ad7c1bf2816336337569&path:/plugins/auto-retry
git+https://github.com/Mark930209/GoDSH.git#e30c3b2a7f6ee07747ec0ff7af920c1e7b91526b&path:/plugins/composer-skill-picker
git+https://github.com/Mark930209/GoDSH.git#0faf87021a8b926d27b087260d6406156c2db0a2&path:/plugins/dsh-file-tree
```

**③ 市场索引** — 启用 `@deepseek-ai/dsh-experimental-plugin-market-bundle`，
添加索引 `https://mark930209.github.io/GoDSH/market-index.json`，Discover 安装。

> 宿主版本要求 DSH `>= 0.2.1-rc.5`（`auto-retry` 的可见重试提示依赖 `client-ui-chat` 的 `RetryNodeView`）。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/install.md](docs/install.md) | 安装 / 升级 / 降级 / 卸载 / 验证排障（npm、git、索引、本机 link） |
| [docs/status.md](docs/status.md) | **当前状态**：插件与发布状态、环境事实、已完成时间线、待办 |
| [docs/publishing.md](docs/publishing.md) | 发版流程、npm 发布与 2FA 坑、市场索引规则、CI、检查清单 |
| [docs/plugin-dev-guide.md](docs/plugin-dev-guide.md) | 插件开发知识库：manifest、slot、事件、DOM 标记、坑 |
| [docs/contributing.md](docs/contributing.md) | 开发循环、分支与 PR、提交规范、新增插件 |
| [docs/maintenance.md](docs/maintenance.md) | 维护循环、回滚、DSH 升级兼容性回归 |
| [docs/repo-layout.md](docs/repo-layout.md) | 为什么 monorepo、命名与 tag 规范、事故复盘 |

## 目录结构

```
README.md                 本文件（唯一的对外说明）
LICENSE                   MIT
repo.config.json          仓库元数据（git 地址 / 作者 / 默认分支 / 市场标题），脚本共用
plugins/<name>/           每个插件的包目录（可直接 install_bundle）
docs/
  install.md              安装方法
  status.md               当前状态 / 环境事实 / 待办
  publishing.md           发布 / npm / 市场索引 / CI
  plugin-dev-guide.md     插件开发知识库
  contributing.md         开发与提交流程
  maintenance.md          版本循环 / 回滚 / 兼容性
  repo-layout.md          monorepo 取舍 / 命名规范 / 事故复盘
  market-index.json       生成物：聚合市场索引（GitHub Pages 托管）
  examples/               索引格式示例
scripts/
  validate-plugins.mjs    校验插件包（语法 / 清单 / locale），CI 与本地共用
  new-plugin.mjs          从模板脚手架一个新插件
  release.mjs             单插件发版：bump → 提交 → tag → 刷新索引 →（可选）推送
  make-market-index.mjs   聚合生成 docs/market-index.json（按 tag 钉版本）
templates/plugin-bundle/  新插件模板（最小可运行）
.github/workflows/        validate / release / pages
```

> `AGENTS.md` 是本地私有文件（工作区指令），已在 `.gitignore` 中，不随仓库分发。

## 快速开始（开发）

```powershell
cd E:\Projects\DSH_Plugins_Dev

node scripts\new-plugin.mjs dsh-my-plugin      # 新建插件（自动套用 repo.config.json）
node scripts\validate-plugins.mjs              # 校验全部插件（--plugin <name> 只查一个）

# 安装到本机 DSH：让 agent 执行，或 Web 侧边栏 → Plugins
#   plugin_manager install_bundle  target = E:\Projects\DSH_Plugins_Dev\plugins\<name>

node scripts\release.mjs dsh-my-plugin patch "修复右键菜单定位" --push   # 仅用户明确要求发版时
```

## 约定

- **改完就 `git commit`**，不积累未提交改动（本仓库出过误删事故，见 [docs/repo-layout.md](docs/repo-layout.md)）。
- 版本 tag 规范：`<目录名>-v<semver>`，如 `dsh-file-tree-v1.1.0`；`package.json#version` 是唯一事实源。
  旧 tag `file-tree-context-menu-v1.0.1` 保留为历史（对应旧包名，已停止更新）。
- 发布 = **tag（必须）+ `npm publish`（推荐）**；CI 只管 tag / Release / 索引，不碰 npm。
- 插件源码只放本仓库，DSH 安装目录只作为部署目标（`link:`）。
- 日常改动**不要** bump 版本 / 打 tag / 建 Release，只有明确要求发版时才做。

## 许可

MIT（见 [LICENSE](LICENSE)）。
