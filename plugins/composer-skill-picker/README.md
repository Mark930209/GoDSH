# composer-skill-picker

在 DSH Web 输入框的**工具行**（`+` 按钮右侧）常驻一个短按钮「技能」，点开后是一个浮层面板，
面板顶部的两个复选框控制列表内容：

| 复选框 | 内容 | 默认 |
|---|---|---|
| 项目技能 | `<项目根>/.agents/skills`、`<项目根>/.dsh/skills` 下的 `SKILL.md` | ✅ 勾选 |
| 全局技能 | 用户级（`<agentsHome>/skills`、`<dshHome>/skills`）与随包内置（`app.asar`）技能 | ⬜ |

选中一个技能 → 把 `/技能名 ` 插进草稿。

## 解决什么问题

- 内置的 `/` 菜单会同时列出内置命令、全部技能（内置 + 用户级 + 项目级），技能一多就很难找。
- 打开会话即自动发现当前项目的技能，不用手工维护清单；需要全局技能时再勾一下复选框。

## 目录与来源

| SkillSource | 目录 | 归类 |
|---|---|---|
| `project-dsh` | `<项目根>/.dsh/skills/<名字>/SKILL.md` | 项目技能 |
| `project-agents` | `<项目根>/.agents/skills/<名字>/SKILL.md` | 项目技能 |
| `user-dsh` | `<dshHome>/skills` | 全局技能 |
| `user-agents` | `<agentsHome>/skills`（如 `C:\Users\congzhisen\.agents\skills`） | 全局技能 |
| `bundled` | 包内 `assets/**/SKILL.md`（如 `office-*`、`diagnose-windows-sandbox-acl`） | 全局技能 |

项目根 = 最近的含 `.git` 的祖先目录（没有 `.git` 时用会话 cwd），由 DSH 的 skill provider 决定。

## 用法

1. 在项目里放技能，例如 `E:\5_8U\Cybertron\.agents\skills\ec9-architect\SKILL.md`。
2. 打开该项目的会话，点工具行的「技能」按钮，面板默认只列该项目的技能（按名字排序）。
3. 点一个技能 → 自动插入 `/ec9-architect `，面板关闭，焦点回到输入框。

## 实现要点

- 触发器：插槽 `conversation.input.left`（id `composer-skill-picker`，order 80），
  一个紧凑按钮（`max-width:96px`，超出省略），样式对齐内置模型选择器。
- 面板：插槽 `shell.overlay`（id `composer-skill-picker-panel`，order 900），
  `position:fixed` 贴着触发器上方弹出，避免被输入框容器裁剪；宽度 420px（随视口收缩），
  列表区 `overflow-y:auto` 独立滚动，长技能名横向可滚（`scrollbar-width:none`）。
  背景用 `--dsw-alias-bg-layer-1`（浅色主题下为纯白），边框 `--dsw-alias-border-l2`。
- 归类：`skills/list` 的条目只有 `path/name/description/whenToUse/modelInvocable`（**没有 `source`**），
  所以取 `.agents/skills` / `.dsh/skills` 之前的目录前缀与会话 cwd 比较——前缀是 cwd 本身或
  其祖先才算项目技能；没有 `path`（随包内置）或路径不在项目内的都归「全局技能」，每条带
  「内置 / 用户」标签。
- 插入：`inputActions.captureInsertion()` 取 CAS span → `insertText('/名字 ', span)`；
  CAS 失败则退回最新光标位置；随后 `conversation.input.for(actx).focus()` 把焦点交还输入框。

## 开发

```powershell
node --check client.js
node --check index.js
# 安装：plugin_manager install_bundle target=E:\Projects\DSH_Plugins_Dev\plugins\composer-skill-picker
# 只改 client.js / locale → 重启 DeepSeek Harness 生效
```

## 已知限制

- 不提供 Agent（agent preset）切换：DSH 的 preset 是会话级选择，且会话开始首轮后即锁死；
  需要时在新建会话处选择。DSH 也不读取 `.github/agents/*.agent.md`（那是 Copilot 等工具的
  约定），项目里的自定义 agent 表现为 `.agents/skills/<名字>/SKILL.md`。
- 面板没有搜索框；列表较长时用面板内滚动（技能名过长时可横向滚动查看全文）。
- 面板不是模态对话框，点击面板外或按 `Esc` 关闭。
