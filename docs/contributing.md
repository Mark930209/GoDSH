# 贡献 / 开发流程

本仓库用 **monorepo + tag 发版**：`plugins/<目录名>` 是独立 npm 包，靠 tag 前缀区分版本。

## 1. 开发循环（每个改动）

```powershell
cd E:\Projects\DSH_Plugins_Dev\plugins\<目录名>

# 改 client.js / index.js / locale / README …

node --check client.js
node --check index.js
cd E:\Projects\DSH_Plugins_Dev
node scripts\validate-plugins.mjs --plugin <目录名>
```

重启 DeepSeek Harness（托盘退出再开）冒烟 → 更新 `CHANGELOG.md` → `git commit`。

客户端插件（有 `client.js`）改完后还要**刷新页面**（Ctrl+R）才能看到新 bundle。

## 2. 分支与 PR

- 从最新 `main` 开分支：`git switch -c feat/<plugin>-<topic>`。
- 推送后开 PR，`validate` 工作流会**只校验改动过的插件**。
- PR 合并前需 CI 通过；合并后删除分支。

## 3. 发版（单个插件）

```powershell
cd E:\Projects\DSH_Plugins_Dev
# 先确认工作区干净、CHANGELOG 已写好对应版本段落
node scripts\release.mjs <目录名> patch "变更摘要" --push
```

脚本会：bump 版本 → 提交 → 打 `<目录名>-v<版本>` tag → 刷新市场索引并提交 → 推送。
推送 tag 后 CI 自动建 Release 并再次刷新索引（幂等）。

> 首次发布用 `tag-only`；发完记得补 `npm publish`。
> 完整说明见 [publishing.md](publishing.md)。

## 4. 本地安装 / 生效

见 [install.md](install.md#5-本机开发安装link)。要点：

- 安装：`plugin_manager install_bundle`，`target` 传 `plugins/<目录名>` 绝对路径。
- 只改 `client.js` / locale / 文档 → 重启 DSH（客户端另需刷新页面）。
- 改了 `package.json` 的 `name` / 依赖，或目录改名/搬家 → `remove_bundle` 旧名再 `install_bundle`。

## 5. 提交规范

- 提交信息：`feat(<plugin>): …` / `fix(<plugin>): …` / `chore(<plugin>): release vX.Y.Z` / `docs: …`。
- 禁止提交 `node_modules`、日志、`.recovery/`、`pnpm-lock.yaml`（见 `.gitignore`）。
- 未通过 `node --check` 的 JS 不允许提交。
- `AGENTS.md` 与 `docs/status.md` 之外的本地私有文件不要提交。

## 6. 新增插件

```powershell
cd E:\Projects\DSH_Plugins_Dev
node scripts\new-plugin.mjs dsh-xxx        # 复制 templates/plugin-bundle
node scripts\validate-plugins.mjs --plugin dsh-xxx
```

然后：`install_bundle` 装上 → 改 `client.js` → 加进 `README.md` 的插件清单 → 提交。
