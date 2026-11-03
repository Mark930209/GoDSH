# 发布 / 安装 / 迁移

> 适用本仓库所有插件（`plugins/<name>`）。仓库：<https://github.com/Mark930209/GoDSH>
> 索引聚合脚本：`scripts/make-market-index.mjs`（默认读 `repo.config.json`）。

## 一、本地安装（3 种，任选）

1. **Web 侧边栏 → Plugins**：规格支持「本地绝对路径 / `包名@版本` / `git+https://…#<commit>&path:/plugins/<name>`」，
   可先 inspect 再装。
2. **对 Agent 说**：「安装插件包 `<路径>`」，由 agent 调 `plugin_manager install_bundle`。
3. **命令行**：`dsh plugin --profile desktop …`（以 `dsh plugin --help` 为准）。

安装即启用；profile 开启 HMR 时立即生效，否则重启后生效。改动影响该 profile 所有会话。

## 二、从 Git 安装（其他机器 / 团队共享）

```
git+https://github.com/Mark930209/GoDSH.git#<40位commit>&path:/plugins/<name>
```

- `<40位commit>` 用小写完整 SHA（`git rev-parse <tag>^{commit}` 或 `git rev-parse HEAD`）。
- monorepo 必须带 `path:`，否则装的是仓库根。

| 方式 | 做法 | 适合 |
|---|---|---|
| **Git（推荐）** | 上面的 git 规格 | 团队共享、留版本历史 |
| **拷贝目录** | 把 `plugins/<name>/` 打包带走，解压后按绝对路径安装 | 无网络最快 |
| **npm** | 改正式包名、去 `private`，`npm publish`，目标机按 `包名@版本` | 广泛分发 |

安装前会做 git 连通性探测（5s）。GitHub 不稳可用 Gitee 镜像（同格式）。

## 三、发布到市场（聚合索引）

DSH 的「插件市场」= 一个 **format 1 JSON 索引** + 用户手动添加索引 URL（官方暂无中心市场，实验性 bundle 默认关闭）。

```powershell
cd E:\Projects\DSH_Plugins_Dev
node scripts\make-market-index.mjs          # 默认 git-url 取 repo.config.json
git add docs/market-index.json && git commit -m "chore: refresh market index" && git push
```

- 脚本扫描 `plugins/*`，每个插件一条，git 源自动带 `path: plugins/<name>`。
- 索引地址（GitHub Pages）：`https://mark930209.github.io/GoDSH/market-index.json`
- **GitHub Pages 已启用**（Build and deployment → Source = **GitHub Actions**）。
  `.github/workflows/pages.yml` 会在 `docs/` 变更时自动部署。
  索引地址：`https://mark930209.github.io/GoDSH/market-index.json`（已实测 200）。
  如要改成分支部署：Settings → Pages 选 `main /docs` 并停用该工作流，二者勿同时使用。
- 用户侧：启用 `@deepseek-ai/dsh-experimental-plugin-market-bundle` → 添加索引 URL → Discover 安装。

## 四、自动发布（推荐）

1. 在插件目录写好 `CHANGELOG.md` 对应版本段落。
2. 仓库根执行：

```powershell
node scripts\release.mjs <plugin> patch "变更摘要" --push
```

3. 推送 tag `<plugin>-v<ver>` 后，`.github/workflows/release.yml` 会自动：
   校验插件 → 校验 `package.json` 版本与 tag 一致 → 建 GitHub Release → 用 tag 提交刷新 `docs/market-index.json` 并回推 `main`。

## 五、索引硬性规则

`format:1`；`title` 必须含 `en`；同一 `version` 只有一个 `source`；
git 源必须 40 位小写 commit；`icon` 内嵌 ≤32 KiB；索引 URL 不能带 query/fragment、**不能重定向**。

## 六、发版检查清单

- [ ] `node scripts/validate-plugins.mjs` 通过
- [ ] 重启 DSH 冒烟通过
- [ ] CHANGELOG 更新、版本 bump、tag `<name>-v<ver>` 已打
- [ ] `docs/market-index.json` 已重生成并提交（release 流程自动做）
- [ ] 另一台机器按 git 规格实装验证一次
