# HANDOFF · 交接文档

> 快照时间：2026-11-03 11:45 (+08:00) · 维护者：congzhisen
> 打开本目录后：先读本文 → 再读 [docs/plugin-dev-guide.md](docs/plugin-dev-guide.md)。

---

## 0. 一句话状态

多插件仓库 `DSH_Plugins_Dev` 已建好；原有插件 `file-tree-context-menu` **v1.1.0** 已迁入
`plugins/file-tree-context-menu` 并以新路径重装（profile 的 `link:` 已更新为 `E:\Projects\DSH_Plugins_Dev\plugins\file-tree-context-menu`）。
仓库已 `git init` 并提交（`ed3a315` 源码 + `b289d36` 索引），已打 tag `file-tree-context-menu-v1.1.0`；
**尚未推送到 GitHub**。`.recovery/`（日志与恢复脚本）已删除，不入库。

**唯一待人工验证**：重启 DeepSeek Harness 后，右键「加入对话」是否出现**蓝色引用芯片**（用户此前反馈白色文字，
判断为旧版模块未加载；v1.1.0 已含芯片插入与「已插入文本」回退提示）。

---

## 1. 环境事实（可直接照抄使用）

| 项 | 值 |
|---|---|
| DSH 安装目录 | `E:\Users\congzhisen\AppData\Local\Programs\DeepSeek Harness` |
| DSH 实现 checkout | `…\resources\app.asar\dsh`（**asar 归档**：PowerShell 读不到内部，必须用 read 工具） |
| profile | `desktop`（`C:\Users\congzhisen\.dsh\profiles\desktop`） |
| 插件安装方式 | `link:E:/Projects/DSH_Plugins_Dev/plugins/file-tree-context-menu` |
| 本仓库 | `E:\Projects\DSH_Plugins_Dev` |
| Node / Git | v24.15.0 / 2.46.0（Git 身份：mazhiqiang <guimaxingtian@163.com>） |
| 验证基线 | DSH `0.2.1-rc.5`，Windows 桌面端 |

## 2. 目录与已就位内容

```
DSH_Plugins_Dev/
├─ AGENTS.md  README.md  HANDOFF.md  LICENSE  .gitignore  .gitattributes
├─ docs/ (repo-layout.md, plugin-dev-guide.md, publishing.md, maintenance.md,
│         market-index.json, examples/)
├─ scripts/ (make-market-index.mjs, new-plugin.mjs)
├─ templates/plugin-bundle/ (最小可运行模板)
└─ plugins/file-tree-context-menu/   ← v1.1.0
   client.js(511行) index.js package.json(1.1.0) cordis.patch.yml icon.svg
   locale/{zh,en}.json README.md CHANGELOG.md LICENSE .gitignore .gitattributes
```

## 3. 已完成

- [x] 迁移：插件从 DSH 安装目录迁到本仓库；旧目录已删除；profile 链接已指向新路径（remove+install，`applied`，v1.1.0，无警告）。
- [x] v1.1.0 能力：文件树右键 4 项；交付物三面（交付卡片 / 改动卡片 / 审阅页选择按钮）右键；
      「加入对话」优先插**引用芯片**（`slash/input-insert-reference`），失败回退纯文本并在菜单显示「已插入文本（非芯片）」。
- [x] 仓库脚手架：README / AGENTS / HANDOFF / CHANGELOG / LICENSE / .gitignore / .gitattributes / docs / scripts / templates。
- [x] 聚合市场索引脚本（扫描 `plugins/*` 生成 `docs/market-index.json`，git 源带 `path`）。

## 4. 待办（按优先级）

1. **验证芯片**：完全退出 DSH 桌面端（含托盘）→ 重启 → 右键文件「加入对话」。
   出蓝色芯片 = 通过；出「已插入文本（非芯片）」或「操作失败」= 打开 DevTools 看 `[file-tree-context-menu]` 警告并把内容反馈。
2. **推 GitHub**：在 GitHub 建**空**仓库 `dsh-plugins`，然后
   `git remote add origin https://github.com/<用户名>/dsh-plugins.git && git push -u origin main --follow-tags`。
3. **替换占位地址**：`package.json` 的 `homepage`/`repository` 与索引里的 `congzhisen` 改成真实地址，然后
   `node scripts/make-market-index.mjs --git-url <真实地址>` 重生成并提交。
4. **开启 GitHub Pages**（Settings → Pages → main /docs），索引地址即 `https://<用户名>.github.io/dsh-plugins/market-index.json`。
5. 计划下一个插件时：`node scripts/new-plugin.mjs <name>`。

## 5. 常用命令

```powershell
cd E:\Projects\DSH_Plugins_Dev
node scripts/new-plugin.mjs dsh-xxx            # 新插件
node --check plugins\<name>\client.js           # 语法自检
# 安装（让 agent 执行）: plugin_manager install_bundle target=<插件目录绝对路径>
# 重启 DeepSeek Harness（托盘退出再开）验证
npm version patch -m "chore: release v%s"      # 在插件目录内执行
git tag -a <name>-v<ver> -m <ver>              # 若 npm 生成的 tag 无前缀
git push --follow-tags
node scripts/make-market-index.mjs --git-url https://github.com/<用户名>/dsh-plugins
```

## 6. 恢复记录（2026-11-03 误删事故）

**经过**：迁移时一次 `Move-Item` 把插件根文件搬进了目标目录、但删除旧 `.git` 失败而中断；
随后我把那个「半成品目标目录」当成残留清理，**误删了当时唯一的源码副本**。

**恢复来源**：
1. Cybertron 仓库历史提交 `a96324ea82` 中 `.agents/dsh-plugins/file-tree-context-menu/` 的早期副本（v1.0 基线）；
2. 会话日志 `C:\Users\congzhisen\.dsh\sessions\--E-5_8U-Cybertron--\<session>\session.v4.jsonl.zstd`
   —— **多帧 zstd**（Node `zstdDecompressSync` 只解第一帧，需按魔数 `28 B5 2F FD` 切帧逐帧解压）；
   从日志回放 **49 个 write/edit 操作，0 失败**，重建全部文件。
3. 幸存的 `locale/*.json`、`docs/market-index.json`、`scripts/make-market-index.mjs` 直接用磁盘原件（未覆盖）。

**验证**：`node --check` 通过；`client.js` 511 行，4 个菜单项、3 个插槽、芯片+回退逻辑齐全；package.json 为 1.1.0。

**教训（已写入 AGENTS.md）**：改完就提交；不要用「移动+清理」组合操作处理唯一副本；
在 asar 环境中 PowerShell 与 Node 对归档内路径不可见，只有 DSH 的 read 工具能读。

## 7. 接续清单（给下一个会话/同事）

1. 以本目录为 DSH 工作区打开（`AGENTS.md` 自动加载）。
2. 读 `docs/plugin-dev-guide.md` 了解 bundle 结构、slot、事件与坑。
3. 按 `docs/maintenance.md` 的循环开发 → 验证 → 提交 → 发版。
4. 收尾更新本文件第 3/4 节的勾选与状态。
