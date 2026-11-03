# 发布 / 安装 / 迁移

> 适用本仓库所有插件（`plugins/<name>`）。索引聚合脚本：`scripts/make-market-index.mjs`。

## 一、本地安装（3 种，任选）

1. **Web 侧边栏 → Plugins**：规格支持「本地绝对路径 / `包名@版本` / `git+https://…#<commit>&path:/plugins/<name>`」，
   可先 inspect 再装。
2. **对 Agent 说**：「安装插件包 `<路径>`」，由 agent 调 `plugin_manager install_bundle`。
3. **命令行**：`dsh plugin --profile desktop …`（以 `dsh plugin --help` 为准）。

安装即启用；profile 开启 HMR 时立即生效，否则重启后生效。改动影响该 profile 所有会话。

## 二、迁移到其他机器

| 方式 | 做法 | 适合 |
|---|---|---|
| **Git（推荐）** | 推 GitHub/Gitee，目标机按 `git+https://<host>/<user>/dsh-plugins.git#<commit>&path:/plugins/<name>` 安装 | 团队共享、留版本历史 |
| **拷贝目录** | 把 `plugins/<name>/` 打包带走，解压后按绝对路径安装 | 无网络最快 |
| **npm** | 改正式包名、去 `private`，`npm publish`，目标机按 `包名@版本` | 广泛分发 |

安装前会做 git 连通性探测（5s）。GitHub 不稳可用 Gitee 镜像（同格式）。

## 三、发布到社区（市场索引）

DSH 的「插件市场」= 一个 **format 1 JSON 索引** + 用户手动添加索引 URL（官方暂无中心市场，实验性 bundle 默认关闭）。

```powershell
cd E:\Projects\DSH_Plugins_Dev
node scripts/make-market-index.mjs --git-url https://github.com/<用户名>/dsh-plugins
git add docs/market-index.json && git commit -m "chore: refresh market index" && git push
```

- 脚本扫描 `plugins/*`，每个插件一条，git 源自动带 `path: plugins/<name>`。
- GitHub 仓库 **Settings → Pages → Deploy from branch → main /docs**，
  索引地址：`https://<用户名>.github.io/dsh-plugins/market-index.json`。
- 用户侧：启用 `@deepseek-ai/dsh-experimental-plugin-market-bundle` → 添加索引 URL → Discover 安装。

索引硬性规则：`format:1`；`title` 必须含 `en`；同一 `version` 只有一个 `source`；
git 源必须 40 位小写 commit；`icon` 内嵌 ≤32 KiB；索引 URL 不能带 query/fragment、**不能重定向**。

## 四、发版检查清单

- [ ] `node --check`、JSON 解析通过
- [ ] 重启 DSH 冒烟通过
- [ ] CHANGELOG 更新、版本 bump、tag `<name>-v<ver>` 已打
- [ ] `docs/market-index.json` 已重生成并提交
- [ ] 另一台机器按 git 规格实装验证一次
