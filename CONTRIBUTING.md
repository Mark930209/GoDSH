# 贡献 / 开发流程

本仓库用 **monorepo + tag 发版**：`plugins/<name>` 是独立 npm 包，靠 tag 前缀区分版本。

## 1. 开发循环（每个改动）

```powershell
cd E:\Projects\DSH_Plugins_Dev\plugins\<name>

# 改 client.js / locale / README …

node --check client.js
node --check index.js
cd E:\Projects\DSH_Plugins_Dev
node scripts\validate-plugins.mjs --plugin <name>
```

重启 DeepSeek Harness（托盘退出再开）冒烟 → 更新 `CHANGELOG.md` → `git commit`。

## 2. 分支与 PR

- 从最新 `main` 开分支：`git switch -c feat/<plugin>-<topic>`。
- 推送后开 PR，`validate` 工作流会**只校验改动过的插件**。
- PR 合并前需 CI 通过；合并后删除分支。

## 3. 发版（单个插件）

```powershell
cd E:\Projects\DSH_Plugins_Dev
# 先确认工作区干净、CHANGELOG 已写好对应版本段落
node scripts\release.mjs <plugin> patch "变更摘要" --push
```

脚本会：bump 版本 → 提交 → 打 `<plugin>-v<ver>` tag → 用 tag 提交刷新市场索引并提交 → 推送（`--follow-tags`）。
推送 tag 后 GitHub Actions 自动建 Release 并再次刷新索引（幂等）。

> 建议先 `--dry-run` 看版本变化。

## 4. 本地安装 / 生效

- 安装：`plugin_manager install_bundle`，`target` 传 `plugins/<name>` 绝对路径。
- 只改 `client.js` / locale / 文档 → 重启 DSH 即生效。
- 改了 `package.json` 的 `name` / 依赖 → `remove_bundle` 再 `install_bundle`。

## 5. 提交规范

- 提交信息：`feat(<plugin>): …` / `fix(<plugin>): …` / `chore(<plugin>): release vX.Y.Z` / `docs: …`。
- 禁止提交 `node_modules`、日志、`.recovery/`、`pnpm-lock.yaml`（见 `.gitignore`）。
- 未通过 `node --check` 的 JS 不允许提交。
