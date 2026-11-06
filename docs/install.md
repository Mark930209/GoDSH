# 安装插件

本仓库的插件有三种装法，**任选一种**即可。装完都要重启 DeepSeek Harness（托盘退出再开）。

| 方式 | 适合 | 你要提供 |
|---|---|---|
| **npm**（最简单） | 日常使用、不想挑 commit | 包名，如 `dsh-auto-retry` |
| **git 规格** | 固定到某个版本、可回溯 | 40 位 commit + `path:` 子目录 |
| **市场索引** | 想浏览/发现、集中管理 | 索引 URL |

> 本机开发时用第四种：[§5 本机开发安装（link）](#5-本机开发安装link)。

## 1. npm 安装

两个插件已发布到公共 npm（2026-11-04，`1.0.1`）；文件树插件已改名为 `dsh-file-tree`，
**新包名尚未发布**（npm 上仍是旧名 `dsh-file-tree-context-menu@1.0.1`，不含 Git 状态功能）：

| 目录 | npm 包名 | 包页 |
|---|---|---|
| `plugins/auto-retry` | `dsh-auto-retry` | <https://www.npmjs.com/package/dsh-auto-retry> |
| `plugins/composer-skill-picker` | `dsh-composer-skill-picker` | <https://www.npmjs.com/package/dsh-composer-skill-picker> |
| `plugins/dsh-file-tree` | `dsh-file-tree`（未发布；旧名 `dsh-file-tree-context-menu`） | <https://www.npmjs.com/package/dsh-file-tree-context-menu> |

在 DSH 里装：**Web 侧边栏 → Plugins → npm 安装页 → 填包名**，例如：

```
dsh-auto-retry
```

要钉版本就填 `dsh-auto-retry@1.0.1`。

命令行等价（仅把包拉到本地，不注册进 DSH）：

```powershell
npm i dsh-auto-retry --registry=https://registry.npmjs.org/
```

> 本机 `.npmrc` 若指向内网镜像，务必带上 `--registry=https://registry.npmjs.org/`，
> 否则会去镜像找包导致 404。

## 2. git 规格安装

格式：

```
git+https://github.com/Mark930209/GoDSH.git#<40位commit>&path:/plugins/<目录名>
```

monorepo **必须带 `path:`**，否则装的是仓库根。当前的 `1.0.1`：

```powershell
git+https://github.com/Mark930209/GoDSH.git#fb77d671e53d26f93718aaebb580e5378f880531&path:/plugins/auto-retry
git+https://github.com/Mark930209/GoDSH.git#e30c3b2a7f6ee07747ec0ff7af920c1e7b91526b&path:/plugins/composer-skill-picker
# 文件树插件已改名，Git 状态功能尚未发版，暂用 main 的最新提交：
git+https://github.com/Mark930209/GoDSH.git#main&path:/plugins/dsh-file-tree
```

拿某个 tag 的 commit：

```powershell
git rev-parse auto-retry-v1.0.1^{commit}
```

安装前 DSH 会做 git 连通性探测（约 5s）。GitHub 不稳时可用同格式的 Gitee 镜像。

## 3. 市场索引安装

```text
1. 启用插件市场 bundle：@deepseek-ai/dsh-experimental-plugin-market-bundle（默认关闭）
   Web 侧边栏 Plugins 页 → 或 patch 里加 include 行 → 重载
2. 添加索引 URL：https://mark930209.github.io/GoDSH/market-index.json
3. Discover → 安装 auto-retry / composer-skill-picker / file-tree-context-menu
4. 重启 DSH，确认 Plugins 页对应条目为 active

> 当前市场索引仍是 2026-11-04 的 1.0.1 快照，文件树条目还是旧名/旧目录；
> 改名与 Git 状态要等用户明确要求发版后才刷新索引。用 npm / git / 本地 link 可先装到新版。
```

索引由 `docs/market-index.json` 生成并托管在 GitHub Pages，规则见
[publishing.md](publishing.md#三市场索引聚合)。

## 4. 拷贝目录安装（离线）

把 `plugins/<name>/` 整个目录拷到目标机，再按绝对路径安装：

```text
plugin_manager install_bundle  target = <目标机上的绝对路径>
```

## 5. 本机开发安装（link）

开发时不要用 npm/git 装，直接 link 到本仓库，改代码立刻可见：

```text
plugin_manager install_bundle  target = E:\Projects\DSH_Plugins_Dev\plugins\<name>
```

- 只改 `client.js` / `locale` / 文档 → **重启 DSH** 即生效（客户端插件另需刷新页面）。
- 改了 `package.json` 的 `name` / 依赖 → **先 `remove_bundle`（旧名）再 `install_bundle`**。
- 目录改名/搬家 → 同上：先按旧名 `remove_bundle`，再按新路径 `install_bundle`。

## 6. 升级 / 降级 / 卸载

| 操作 | 做法 |
|---|---|
| 升级（npm） | 装 `dsh-xxx@新版本`；或 `remove_bundle` 后重装 |
| 升级（git） | 换成新 tag 的 commit 重新 `install_bundle` |
| 降级 | 用旧 tag 的 commit 重新安装 |
| 卸载 | `plugin_manager remove_bundle  target = <包名>` |

`remove_bundle` 的 `target` 是**包名**（如 `dsh-auto-retry`），不是目录路径。

## 7. 验证与排障

1. `plugin_manager list_bundles` → 目标插件 `installed / enabled: true`。
2. `plugin_manager list_plugins` → 对应行 `fiberPhase: active`。
3. 客户端插件（技能下拉、右键菜单）改完后**刷新页面**（Ctrl+R）才看得到新 bundle。
4. 宿主版本要求：`engines.dsh >= 0.2.1-rc.5`
   （`auto-retry` 的「正在重试模型请求」一行依赖 `client-ui-chat` 的 `RetryNodeView`；旧版本会直接拒绝安装）。
5. 装了但没反应：先确认 profile 的依赖键是**当前包名**——
   改过包名的插件（如历史上的 `@local/*` → `dsh-*`）必须 `remove_bundle` 旧名再装，
   否则 `node_modules` 里还是旧名，行里的 `moduleName` 与依赖键对不上。
