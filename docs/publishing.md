# 发布（npm / git tag / 市场索引）

> 安装方法见 [install.md](install.md)；日常维护与回滚见 [maintenance.md](maintenance.md)。
> 索引聚合脚本：`scripts/make-market-index.mjs`（默认读 `repo.config.json`）。

一次完整发布 = **git tag（必须）+ npm publish（可选但推荐）**。
tag 驱动 CI 建 GitHub Release 并刷新市场索引；npm 需要手动补一条 `npm publish`。

## 一、发布一个插件（标准三步）

1. 在插件目录写好 `CHANGELOG.md` 对应版本段落。
2. 仓库根执行（工作区必须干净）：

```powershell
node scripts\release.mjs <目录名> patch "变更摘要" --push      # 修 bug
node scripts\release.mjs <目录名> minor "变更摘要" --push      # 新能力
node scripts\release.mjs <目录名> major "变更摘要" --push      # 不兼容
node scripts\release.mjs <目录名> tag-only "首个版本" --push   # 版本号已是 X.Y.Z、只补 tag
```

`release.mjs` 会：bump 版本 → 提交 → 打 tag `<目录名>-v<版本>` → 刷新市场索引并提交 →
（`--push`）`git push origin HEAD --follow-tags`。

> 首次发布必须用 `tag-only`：`package.json` 已经是 1.0.0 时再 `patch` 会顶成 1.0.1。

3. 推送 tag 后 `.github/workflows/release.yml` 自动：校验插件 → 校验 `package.json` 版本与 tag 一致 →
   建 GitHub Release → 用 tag 提交刷新 `docs/market-index.json` 并回推 `main`（只改本插件那条）。

先看版本变化：加 `--dry-run`。

### 为什么「发一个插件不会带上别的插件」

tag / Release 一直是分插件的，问题出在索引：早期脚本给**每个**插件写同一个 commit（HEAD）和时间戳，
重生成索引就等于把「已提交但未发布」的改动顺带发布。现在 `make-market-index.mjs` **按 tag 钉版本**：

| 规则 | 说明 |
|---|---|
| 只收录**已发布**插件 | 判定标准：存在 tag `<目录名>-v<package.json 里的版本>` |
| 已发布插件钉死在自己的 tag | `source.commit` = 该 tag 指向的提交，`updated` = 该 tag 的提交时间 |
| 未打 tag 的插件默认**跳过** | 加 `--include-unreleased` 才收录（指向 HEAD，不推荐长期用） |

同一输入重复运行输出字节一致（幂等），不会产生无意义 diff。

## 二、npm 发布

三个插件已发布到公共 npm（2026-11-04，`1.0.1`），包名见 [install.md](install.md#1-npm-安装)。

```powershell
# 本机 .npmrc 指向内网镜像，必须显式指定公共 registry
cd E:\Projects\DSH_Plugins_Dev\plugins\auto-retry
npm publish --registry=https://registry.npmjs.org/
```

注意：

- 包名是**无作用域的裸名** `dsh-*`，`package.json` 里不能有 `"private": true`。
- `files` 只含运行所需：`index.js` / `client.js` / `cordis.patch.yml` / `locale` / `icon.svg`
  （README、LICENSE 由 npm 自动带上），`test/` 不进包。
- **npm 版本必须等于随后打的 tag 版本**，否则索引（按 tag 收录）与 npm 会版本分叉。
- 改过包名后本机要 `remove_bundle` 旧名再 `install_bundle`，否则 profile 依赖键还是旧名。

### 账号层面的两个坑（已踩过）

1. **写入需要 2FA**。账号开着「Authorization and Writes」时，普通 token 发布会 403：
   `Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.`
   解决：建 **Classic → Automation** token（或 Granular + 勾选 `Bypass two-factor authentication`），
   然后 `npm config set //registry.npmjs.org/:_authToken=npm_xxxx`。
   **Classic → Publish** 类型的 token 仍要动态码，不能用。

2. **首次发布会生成 `0.0.0-stage` 占位版本**（staged publishing，
   见 <https://docs.npmjs.com/staged-publishing>）。它出现在包页版本列表里，但 `dist-tags.latest`
   指向真实版本，**不影响安装**。bypass-2FA 的 token 无权删除它
   （`403 ... may not perform this action`，见 `npm-gat-bypass2fa-deprecation`），
   要清理只能在 npmjs.com 用 2FA 手动操作。

## 三、市场索引（聚合）

DSH 的「插件市场」= 一个 **format 1 JSON 索引** + 用户手动添加索引 URL
（官方暂无中心市场，实验性 bundle 默认关闭）。

```powershell
cd E:\Projects\DSH_Plugins_Dev
node scripts\make-market-index.mjs                    # 生成 docs/market-index.json
git add docs/market-index.json && git commit -m "chore: refresh market index" && git push
```

- 索引地址（GitHub Pages）：`https://mark930209.github.io/GoDSH/market-index.json`
- Pages 已启用（Settings → Pages → Source = **GitHub Actions**），
  `.github/workflows/pages.yml` 在 `docs/` 变更时自动部署。
  若改成「分支 `main /docs`」部署，请停用该工作流，二者勿同时使用。
- 用户侧：启用 `@deepseek-ai/dsh-experimental-plugin-market-bundle` → 添加索引 URL → Discover 安装。

### 索引硬性规则

`format:1`；`title` 必须含 `en`；同一 `version` 只有一个 `source`；
git 源必须是 40 位小写 commit；`icon` 内嵌 ≤32 KiB；
索引 URL 不能带 query/fragment、**不能重定向**。

格式示例见 [examples/market-index.example.json](examples/market-index.example.json)。

## 四、CI 工作流

| 工作流 | 触发 | 作用 |
|---|---|---|
| `validate.yml` | PR / push `main` | PR 只校验改动过的插件；`main` 全量校验 |
| `release.yml` | push tag `*-v*` | 校验 → 版本一致性 → 建 Release → 刷新索引回推 `main` |
| `pages.yml` | `docs/` 变更 | 部署 `docs/` 到 GitHub Pages（托管索引） |

## 五、发版检查清单

- [ ] `node scripts\validate-plugins.mjs` 通过
- [ ] 重启 DSH 冒烟通过
- [ ] `CHANGELOG.md` 已写对应版本段落
- [ ] 版本 bump（或首个版本用 `tag-only`）、tag `<目录名>-v<版本>` 已打并推送
- [ ] GitHub Release 已由 CI 建好
- [ ] `docs/market-index.json` 已刷新（release 流程自动做，且只改本插件那条）
- [ ] **`npm publish` 已补发**（CI 不碰 npm），`npm view <包名> version` 与 tag 版本一致
