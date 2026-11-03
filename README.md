# DSH 插件开发工作区（多插件单仓库）

本仓库是**所有自研 DeepSeek Harness（DSH）插件的唯一源码来源**。一个插件一个目录，放在 `plugins/` 下。

> 新人/新会话请先读 **[HANDOFF.md](HANDOFF.md)**（当前状态 + 待办 + 环境事实），
> 再读 [docs/plugin-dev-guide.md](docs/plugin-dev-guide.md)（开发知识库）。

## 目录

```
AGENTS.md                 工作区指令（DSH 打开本目录时自动加载）
HANDOFF.md                交接文档：当前状态 / 待办 / 环境 / 恢复记录
plugins/<name>/           每个插件的包目录（可直接 install_bundle）
docs/
  repo-layout.md          为什么用 monorepo、命名与 tag 规范、事故复盘
  plugin-dev-guide.md     插件开发知识库（manifest、slot、事件、DOM 标记、坑）
  publishing.md           发布 / 安装 / 迁移 / 市场索引
  maintenance.md          版本循环 / 回滚 / 兼容性回归
  market-index.json       生成物：聚合市场索引（GitHub Pages 托管）
  examples/               索引格式示例
scripts/
  make-market-index.mjs   聚合生成 docs/market-index.json
  new-plugin.mjs          从模板脚手架一个新插件
templates/plugin-bundle/  新插件模板（最小可运行）
```

## 快速开始

```powershell
cd E:\Projects\DSH_Plugins_Dev

# 新建插件
node scripts/new-plugin.mjs dsh-my-plugin

# 安装到 DSH（让 agent 执行，或 Web 侧边栏 → Plugins）
#   install_bundle  target = E:\Projects\DSH_Plugins_Dev\plugins\<name>

# 生成/刷新市场索引
node scripts/make-market-index.mjs --git-url https://github.com/<你>/dsh-plugins
```

## 关键约定

- **改完代码要重启 DeepSeek Harness** 才生效（插件以 `link:` 方式安装，读的是本仓库目录）。
- **提交要勤**：每完成一个可验证的小步就 `git commit`（本仓库有过误删事故，见 docs/repo-layout.md）。
- 每个插件的对外元数据在 `package.json`（`name` / `version` / `dsh`）与 `locale/*.json`（市场展示标题描述）。
- 版本 tag 规范：`<插件名>-v<semver>`，如 `file-tree-context-menu-v1.1.0`。

## 许可

MIT（见 [LICENSE](LICENSE)）。
