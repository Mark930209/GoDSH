# GoDSH 插件工作区（多插件单仓库）

本仓库是**所有自研 DeepSeek Harness（DSH）插件的唯一源码来源**。一个插件一个目录，放在 `plugins/` 下。

- 远程仓库：<https://github.com/Mark930209/GoDSH>
- 维护者：Mark930209 `<guimaxingtian@163.com>`

> 新人 / 新会话请先读 **[HANDOFF.md](HANDOFF.md)**（当前状态 + 待办 + 环境事实），
> 再读 [docs/plugin-dev-guide.md](docs/plugin-dev-guide.md)（开发知识库）。

## 目录

```
AGENTS.md                 工作区指令（DSH 打开本目录时自动加载）
HANDOFF.md                交接文档：当前状态 / 待办 / 环境 / 恢复记录
repo.config.json          仓库元数据（git 地址 / 作者 / 默认分支 / 市场标题），脚本共用
plugins/<name>/           每个插件的包目录（可直接 install_bundle）
docs/
  repo-layout.md          为什么用 monorepo、命名与 tag 规范、事故复盘
  plugin-dev-guide.md     插件开发知识库（manifest、slot、事件、DOM 标记、坑）
  publishing.md           发布 / 安装 / 迁移 / 市场索引 / Pages
  maintenance.md          版本循环 / 回滚 / 兼容性回归
  market-index.json       生成物：聚合市场索引（GitHub Pages 托管）
  examples/               索引格式示例
scripts/
  validate-plugins.mjs    校验插件包（语法 / 清单 / locale），CI 与本地共用
  new-plugin.mjs          从模板脚手架一个新插件
  release.mjs             单个插件发版：bump → 提交 → tag → 刷新索引 →（可选）推送
  make-market-index.mjs   聚合生成 docs/market-index.json
templates/plugin-bundle/  新插件模板（最小可运行）
.github/
  workflows/validate.yml  CI：PR 校验改动插件，main 全量校验
  workflows/release.yml   tag 推送 → GitHub Release + 自动刷新市场索引
  workflows/pages.yml     docs/ 部署到 GitHub Pages（托管索引）
  pull_request_template.md
CONTRIBUTING.md           开发 / 提交流程
```

## 快速开始

```powershell
cd E:\Projects\DSH_Plugins_Dev

# 新建插件（自动套用 repo.config.json 的仓库地址与作者）
node scripts\new-plugin.mjs dsh-my-plugin

# 校验全部插件（或只校验一个：--plugin <name>）
node scripts\validate-plugins.mjs

# 安装到 DSH（让 agent 执行，或 Web 侧边栏 → Plugins）
#   install_bundle  target = E:\Projects\DSH_Plugins_Dev\plugins\<name>

# 发版（bump + 提交 + tag + 刷新索引，--push 直接推送）
node scripts\release.mjs dsh-my-plugin patch "修复右键菜单定位" --push
```

## 插件清单

| 插件 | 版本 | 说明 |
|---|---|---|
| [file-tree-context-menu](plugins/file-tree-context-menu/) | 1.0.0 | 工作区文件树 / 交付物列表右键：加入对话（引用芯片）、复制 @ 引用 / 路径 / 链接、DSH 内预览、终端、新建 / 重命名 / 回收站、本机打开 |
| [composer-skill-picker](plugins/composer-skill-picker/) | 1.0.0 | 输入框工具行常驻下拉框，自动发现项目技能（`.dsh/skills`、`.agents/skills`），选中即插入 `/技能名` |
| [auto-retry](plugins/auto-retry/) | 1.0.0 | Host-only 策略插件：模型请求失败按指数退避重试，整轮仍失败则延时自动续跑同一会话，直到任务完成或达到次数上限 |

## 工作流（git）

- `main` 始终保持可安装、可发版；新功能开分支（`feat/<plugin>-<topic>`）→ PR → CI 通过后合并。
- 每完成一个可验证的小步就 `git commit`（本仓库有过误删事故，见 docs/repo-layout.md）。
- **发版靠 tag**：`<插件名>-v<semver>`（如 `file-tree-context-menu-v1.1.0`）。
  推 tag 会触发 `release.yml`：校验 → 建 GitHub Release → 刷新 `docs/market-index.json` 并回推 `main`。
- 详见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [docs/maintenance.md](docs/maintenance.md)。

## 关键约定

- **改完代码要重启 DeepSeek Harness** 才生效（插件以 `link:` 方式安装，读的是本仓库目录）。
- 提交要勤：每完成一个可验证的小步就 `git commit`。
- 每个插件的对外元数据在 `package.json`（`name` / `version` / `dsh`）与 `locale/*.json`（市场展示标题描述）。
- 版本 tag 规范：`<插件名>-v<semver>`，如 `file-tree-context-menu-v1.1.0`。

## 许可

MIT（见 [LICENSE](LICENSE)）。
