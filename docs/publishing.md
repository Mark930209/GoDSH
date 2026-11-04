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
| **npm（已发布）** | 见下方第 2.5 节，`npm i dsh-<name>` 或在 DSH 的 npm 安装页填包名 | 最省事，不用挑 commit |
| **拷贝目录** | 把 `plugins/<name>/` 打包带走，解压后按绝对路径安装 | 无网络最快 |

安装前会做 git 连通性探测（5s）。GitHub 不稳可用 Gitee 镜像（同格式）。

## 二·五、npm 安装

三个插件已发布到**公共 npm**（2026-11-04，`1.0.1`），包名与目录名不同（去掉了 `@local/` 作用域）：

| 目录 | npm 包名 | registry 地址 |
|---|---|---|
| `plugins/auto-retry` | `dsh-auto-retry` | <https://www.npmjs.com/package/dsh-auto-retry> |
| `plugins/composer-skill-picker` | `dsh-composer-skill-picker` | <https://www.npmjs.com/package/dsh-composer-skill-picker> |
| `plugins/file-tree-context-menu` | `dsh-file-tree-context-menu` | <https://www.npmjs.com/package/dsh-file-tree-context-menu> |

其他机器：DSH 的 **npm 安装页填包名**（如 `dsh-auto-retry`），或 `npm i dsh-auto-retry`。

发布（维护者，需先登录公共 registry）：

```powershell
# 本机 .npmrc 指向内网镜像，必须显式指定公共 registry 登录/发布
npm login --registry=https://registry.npmjs.org/
cd E:\Projects\DSH_Plugins_Dev\plugins\auto-retry
npm publish --registry=https://registry.npmjs.org/
```

注意：

- 包名去掉了 `private`，`files` 只含 `index.js` / `client.js` / `cordis.patch.yml` / `locale` / `icon.svg`
  （README、LICENSE 由 npm 自动带上），`test/` 不进包。
- **npm 包的版本和 git tag 各自独立但保持一致**：`npm publish` 用的 `package.json` 版本要等于随后打的
  `<目录名>-v<版本>` tag，否则市场索引（按 tag 收录）和 npm 会出现版本分叉。
- 改名后本机必须 `remove_bundle` 旧包名再 `install_bundle`，否则 profile 里的依赖键仍是旧名。

### 账号层面的两个坑（已踩过）

1. **写入需要 2FA**。账号开了「Authorization and Writes」时，普通 `npm publish` 会 403：
   `Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.`
   解决：建一个 **Classic → Automation** token（或 Granular + 勾选 `Bypass two-factor authentication`），
   写进 `~/.npmrc`：
   ```powershell
   npm config set //registry.npmjs.org/:_authToken=npm_xxxx
   ```
   注意：**Classic → Publish** 类型的 token 仍要动态码，不能用。

2. **首次发布会生成 `0.0.0-stage` 占位版本**（staged publishing，见
   <https://docs.npmjs.com/staged-publishing>）。占位版本会出现在包页面的版本列表里，
   但 `dist-tags.latest` 指向真实版本，安装不受影响。
   **bypass-2FA 的 token 无权删除它**（`403 ... may not perform this action`，见
   `npm-gat-bypass2fa-deprecation`），要清理只能在 npmjs.com 用 2FA 手动操作。
   下次发版前如需干净版本列表，请先在网页端删掉占位版本。

## 三、发布到市场（聚合索引）

DSH 的「插件市场」= 一个 **format 1 JSON 索引** + 用户手动添加索引 URL（官方暂无中心市场，实验性 bundle 默认关闭）。

```powershell
cd E:\Projects\DSH_Plugins_Dev
node scripts\make-market-index.mjs          # 默认 git-url 取 repo.config.json
git add docs/market-index.json && git commit -m "chore: refresh market index" && git push
```

### 索引是一份文件，但**发布是各插件独立的**

索引里 `plugins[]` 是全仓库一个数组，所以重新生成必然重写整个文件。为了做到「发 A 不影响 B」，
`make-market-index.mjs` 采用**按 tag 钉版本**的规则：

| 规则 | 说明 |
|---|---|
| 只收录**已发布**插件 | 判定标准：存在 tag `<插件目录名>-v<package.json 里的版本>` |
| 已发布插件钉死在自己的 tag | `source.commit` = 该 tag 指向的提交，`updated` = 该 tag 的提交时间 |
| 未打 tag 的插件默认**跳过** | 加 `--include-unreleased` 才会收录（指向 HEAD，不推荐长期用） |

因此：给 `auto-retry` 打 `auto-retry-v1.0.0` 再重生成索引，`file-tree-context-menu` 那条记录**逐字不变**，
`composer-skill-picker` 若还没有 tag 就完全不出现。同一输入重复运行输出字节一致（幂等），不会产生无意义 diff。

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

首次发布（`package.json` 已是 1.0.0、还没有 tag）用 `tag-only`，否则 `patch` 会把 1.0.0 顶成 1.0.1：

```powershell
node scripts\release.mjs <plugin> tag-only "首个版本" --push
```

3. 推送 tag `<plugin>-v<ver>` 后，`.github/workflows/release.yml` 会自动：
   校验插件 → 校验 `package.json` 版本与 tag 一致 → 建 GitHub Release →
   用 tag 提交刷新 `docs/market-index.json` 并回推 `main`（只改本插件那条）。

## 五、索引硬性规则

`format:1`；`title` 必须含 `en`；同一 `version` 只有一个 `source`；
git 源必须 40 位小写 commit；`icon` 内嵌 ≤32 KiB；索引 URL 不能带 query/fragment、**不能重定向**。

## 六、发版检查清单

- [ ] `node scripts/validate-plugins.mjs` 通过
- [ ] 重启 DSH 冒烟通过
- [ ] CHANGELOG 更新、版本 bump（或首个版本用 `tag-only`）、tag `<name>-v<ver>` 已打
- [ ] `docs/market-index.json` 已重生成并提交（release 流程自动做，且只改本插件那条）
- [ ] 另一台机器按 git 规格实装验证一次
