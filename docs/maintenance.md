# 维护手册（版本循环 / 回滚 / 兼容性）

## 1. 日常维护循环（每次改动）

```powershell
cd E:\Projects\DSH_Plugins_Dev\plugins\<name>

# 1 改代码（client.js / locale / README …）

# 2 静态检查（仓库根有统一校验）
cd E:\Projects\DSH_Plugins_Dev
node scripts\validate-plugins.mjs --plugin <name>

# 3 重启 DeepSeek Harness（托盘退出再开）→ 右键冒烟

# 4 更新 CHANGELOG.md，提交你的改动
git add plugins/<name>
git commit -m "feat(<name>): …"
```

所有改动**及时提交**：每步可验证就 `git commit`。

## 2. 发版（脚本一键）

```powershell
cd E:\Projects\DSH_Plugins_Dev
node scripts\release.mjs <name> patch "变更摘要" --dry-run   # 先看版本
node scripts\release.mjs <name> patch "变更摘要" --push      # 提交+tag+索引+推送
cd plugins\<name>; npm publish --registry=https://registry.npmjs.org/   # 补发 npm（CI 不管 npm）
```

- patch = 修复；minor = 新能力；major = 不兼容（通常是要适配新版 DSH 接口）。
- tag 自动为 `<name>-v<version>`，推送后 CI 自动建 Release 并刷新索引。
- **npm 版本必须与 tag 一致**；首次发布用 `tag-only`，详见 [publishing.md](publishing.md)。

手动等价流程（不推荐）：

```powershell
cd plugins\<name>
npm version patch --no-git-tag-version
cd ../..
git add -A && git commit -m "chore(<name>): release vX.Y.Z"
git tag -a <name>-vX.Y.Z -m "<name>-vX.Y.Z"
node scripts\make-market-index.mjs
git add docs/market-index.json && git commit -m "chore: refresh market index"
git push origin HEAD --follow-tags
```

## 3. 生效方式

| 改动 | 生效 |
|---|---|
| `client.js` / `locale` / 文档 | 重启 DSH（`link:` 安装读本目录） |
| `package.json` 的 `name`/依赖 | `remove_bundle` → `install_bundle` |
| 换了插件目录 | `remove_bundle`（旧）→ `install_bundle`（新） |

排障：`list_plugins` 看插件行是否 `enabled / active`；DevTools 看 `[<插件id>]` 警告。

## 4. 回滚

- 装回旧版：`install_bundle` 用旧 tag 的 commit（`git rev-parse <tag>^{commit}`）。
- 代码回滚：`git revert <坏提交>`（已推送时）或 `git reset --hard <旧tag>`（本地）。
- 版本已发布又出问题：发 patch 修复版，别复用旧 tag。

## 5. 兼容性回归（DSH 升级后跑一遍）

1. 插件行 `active`；2. 核心交互可用；3. 控制台无报错；4. 多语言/主题正常。
接口变了：改代码 → 升版本（minor/major）→ 更新 `engines.dsh` 与索引 → 回归记录写进 CHANGELOG。

**当前基线：DSH `0.2.1-rc.5`（Windows 桌面端）。**

## 6. 新增插件

```powershell
cd E:\Projects\DSH_Plugins_Dev
node scripts\new-plugin.mjs dsh-xxx     # 复制 templates/plugin-bundle
node scripts\validate-plugins.mjs --plugin dsh-xxx
# 然后：装它、改 client.js、加进 README 的插件清单、提交
```
