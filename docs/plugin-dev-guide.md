# DSH 插件开发知识库

> 全部来自对 DSH 宿主源码（`resources/app.asar/dsh`）的实测与 v1.1.0 插件的落地经验。
> 参考实现：`plugins/file-tree-context-menu/`。

## 1. 一个 bundle 的最小构成

| 文件 | 作用 |
|---|---|
| `package.json` | 清单：`exports`、`files`、`dsh.bundle.patch`、`dsh.client` |
| `cordis.patch.yml` | bundle patch，往组合里 `insert` 本插件的行 |
| `index.js` | Host 半部（不写 UI 时 `export function apply() {}` 即可） |
| `client.js` | **Client 半部（UI 都在这）** |
| `locale/{zh,en}.json` | 市场/管理页展示用 `meta.title`/`meta.description` |
| `icon.svg` | 图标（市场索引内嵌 ≤32 KiB） |

```jsonc
// package.json 关键字段
{
  "type": "module",
  "exports": { ".": "./index.js", "./client": "./client.js",
               "./locale/*.json": "./locale/*.json", "./icon": "./icon.svg" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true,
                "inject": ["@deepseek-ai/dsh-client-ui-sidebar-files",
                           "@deepseek-ai/dsh-client-ui-conversation",
                           "@deepseek-ai/dsh-client-locale"] }
  }
}
```

```yaml
# cordis.patch.yml
- insert:
    - id: <插件id>
      name: '@local/<插件名>'
```

## 2. client.js 模块骨架

```js
window.__ModuleLoader__.load({
  id: '@local/<插件名>',            // 模块 id
  factory(require) {
    const React = require('react'); // 宿主提供，禁止打包 React/第三方运行时
    const { useState, useEffect } = React;

    function MyWidget(props) {
      // props: { sessionId, inputActions, useSessions, ... } 视插槽而定
      return React.createElement('div', null, 'hello');
    }

    function apply(ctx) {
      // 注册 slot（列表槽用 inject + register）
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: '<插件id>.widget', order: 90 }, MyWidget));
    }

    return { inject: ['slots', 'locale'], apply };
  }
});
```

- `ctx.locale.register(NS, { zh, en })` + `ctx.locale.bind(NS)` 得到 `t(key)`；双语必备。
- `ctx.effect(() => cleanup, label)` 注册副作用与清理。

## 3. 常用插槽与 props

| 插槽 | 用途 | 关键 props |
|---|---|---|
| `sidebar.right.tab.files.actions` | 文件树页工具条区（**会话作用域**） | `sessionId`、`inputActions`、`useSessions` |
| `conversation.input.left` | 输入框左侧（会话作用域） | 同上 |
| `shell.overlay` | 全局浮层（可渲染 fixed 菜单） | 无会话 props |
| `deliverables.file.actions` / `deliverables.review.file.actions` | 交付物动作 | `actionUrl`、`onAction`（**不含路径**，慎用） |

会话作用域取工作区根：

```js
const cwd = props.useSessions((sessions) => sessions.byId[props.sessionId]?.cwd);
```

## 4. 插入「引用芯片」（重点）

```js
const actions = props.inputActions;          // 从插槽 props 捕获并持久化
const span = actions.captureInsertion();     // CAS 位点：{ start, end, draftRev, ... }
const sessions = ctx.get('sessions');        // 官方取服务方式（见 ui-conversation 源码）
const actx = sessions.scope(sessionId);      // 会话作用域 ctx；未被保留时为 undefined
const applied = actx.bail(actx, 'slash/input-insert-reference', {
  reference: {
    source: 'reference',
    ref: '@相对路径',            // 工作区相对、/ 分隔；目录以 / 结尾
    label: '文件名或目录名/',
    appearance: 'file' | 'folder',
    clipboardText: '@相对路径'
  },
  span
});
// applied === true → 成功插入芯片；否则（phase 忙 / draftRev 过期 / 无监听）回退：
actions.insertText('@相对路径', span);
```

- `bail(thisArg, name, payload)`：**thisArg 必须是该会话的 actx**（每会话用了 `Context.filter`）。
- 事件由 `ui-conversation` 的 `InputHub` 监听：`slash/input-insert-reference`、`-insert-text`、
  `-begin-command`、`-consume-token`。
- 失败要**给用户可见区分**（例如菜单项提示「已插入文本（非芯片）」），并 `console.warn` 原因。

## 5. 稳定的 DOM 标记（用于识别右键目标）

| 界面 | 标记 |
|---|---|
| 文件树行 | `li[data-files-entry="directory\|file\|other"][data-files-path="<绝对路径>"]` |
| 交付卡片 | `[data-presented-file]` 内 `button[title=<解析后绝对路径>]` |
| 改动文件卡片 | `div[data-changed-files]` 内 `button[aria-describedby]` + `span[hidden]`=绝对路径 |
| 审阅页文件按钮 | `button[data-review-file]`（值=原始路径） |

先 `event.target.closest(selector)`，再取属性；不要猜 class 名。

## 6. 坑清单（血泪）

1. **改代码要重启 DSH** 才加载新 JS 模块——尤其是「替换已安装的包」后；只刷新页面不够。
2. `ctx.get('sessions')` 是取服务的方式；不要 `require` 宿主内部包（跨 bundle 禁止）。
3. `resources/app.asar` 是**归档**：PowerShell/Node 的 fs 看不到内部，必须用 DSH 的 `read` 工具。
4. Windows 中文控制台：`Get-Content` 可能把 UTF-8 显示成乱码——**用 Node/read 工具校验编码**，别被吓到。
5. 文件沙箱 ACL 异常时用 `diagnose-windows-sandbox-acl`（见全局技能）。
6. 不引入第三方运行时依赖；只 `require('react')`。
7. 菜单定位用 `position: fixed` + `clientX/clientY`，并监听 `scroll`/`resize` 关闭。
8. 路径拼 @ 引用：`"` 或控制字符 → 用 `@"path"` 引号形式；目录结尾带 `/`。

## 7. 验证清单（每次改动）

- [ ] `node --check client.js`、JSON 可解析
- [ ] 重启 DSH，右键目标出现菜单，4 项齐全
- [ ] 「加入对话」出芯片（或明确回退提示）
- [ ] 三种复制都成功（有「已复制」反馈）
- [ ] 交付物三面（卡片 / 改动卡片 / 审阅页）都能右键
- [ ] 中英切换文案正确；暗/亮主题颜色正常
