# composer-skill-picker

在 DSH Web 输入框的**工具行**（`+` 按钮右侧）常驻一个**下拉框**，自动发现**当前项目**的
自定义技能；选中即把 `/技能名 ` 插进草稿，省去在全局 `/` 菜单里从几十个技能中翻找。

## 解决什么问题

- 内置的 `/` 菜单会同时列出内置命令、全部技能（内置 + 用户级 + 项目级），技能一多就很难找。
- DSH 里的「自定义 agent」就是 **skill**（`.agents/skills/<名字>/SKILL.md`）。本插件把
  **当前项目**的这类技能直接做成下拉项，打开会话即自动加载，不需要手工维护清单。

| SkillSource | 目录 |
|---|---|
| `project-dsh` | `<项目根>/.dsh/skills/<名字>/SKILL.md` |
| `project-agents` | `<项目根>/.agents/skills/<名字>/SKILL.md` |

项目根 = 最近的含 `.git` 的祖先目录（没有 `.git` 时用会话 cwd），由 DSH 的 skill provider 决定。

## 用法

1. 在项目里放技能，例如 `E:\5_8U\Cybertron\.agents\skills\ec9-architect\SKILL.md`
   （该目录下现有 19 个这类「agent」）。
2. 打开该项目的会话，工具行会出现「技能」下拉框，点开即列出该项目的技能（按名字排序）。
3. 选中一个 → 自动插入 `/ec9-architect `，焦点回到输入框，继续写剩下的话并发送。
4. 被插入的 `/技能名` 由宿主按 `skill` 解析，与内置菜单行为一致。

## 实现要点

- 插槽：`conversation.input.left`（id `composer-skill-picker`，order 80），渲染原生
  `<select>`（与内置模型选择器同一套样式：透明底、28px、右侧 chevron、主题配色）。
- 候选：`ctx.remote.skills.list({ sessionId }, signal)`，过滤 `source ∈ {project-dsh, project-agents}`，
  按名字排序；子代理会话返回空列表。
- 插入：`inputActions.captureInsertion()` 取 CAS span → `insertText('/名字 ', span)`；
  CAS 失败则退回最新光标位置；随后 `conversation.input.for(actx).focus()` 把焦点交还输入框。
- 空/加载/失败态直接显示在下拉框上（「当前项目没有技能」「技能加载中…」「技能加载失败」），
  当前项目没有技能时下拉框为禁用态。

## 开发

```powershell
node --check client.js
node --check index.js
# 安装：plugin_manager install_bundle target=E:\Projects\DSH_Plugins_Dev\plugins\composer-skill-picker
# 只改 client.js / locale → 重启 DeepSeek Harness 生效
```

## 已知限制

- 只列项目级技能；用户级（`<agentsHome>/skills`，例如 `C:\Users\congzhisen\.agents\skills`
  里的 30+ 个）与 `customSkillDirs` 不纳入，避免又变成一长串。需要时改 `client.js` 的
  `PROJECT_SOURCES`（或再加一个来源）。
- 不负责切换 Agent 预设：DSH 的 agent preset 是**会话级**的，只能在新建会话的 hero 处选择。
- 原生 `<select>` 的候选项只有名字（描述放在 `title` 提示里），没有搜索框；技能很多时
  可用浏览器自带的按键首字母跳转。
