# DSH 插件开发知识库

> 全部来自对 DSH 宿主源码（`resources/app.asar/dsh`）的实测与 v1.1.0 插件的落地经验。
> 参考实现：`plugins/dsh-file-tree/`（右键菜单 + Git 状态 + Host 文件操作）。

## 1. 一个 bundle 的最小构成

| 文件 | 作用 |
|---|---|
| `package.json` | 清单：`exports`、`files`、`dsh.bundle.patch`、`dsh.client` |
| `cordis.patch.yml` | bundle patch，往组合里 `insert` 本插件的行 |
| `index.js` | Host 半部（不写 UI 时 `export function apply() {}` 即可） |
| `client.js` | **Client 半部（UI 都在这）**；**只有声明了 `dsh.client` 才需要**，Host-only 策略插件可以没有 |
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
      name: '<包名>'          # 与 package.json 的 name 一致，如 dsh-file-preview
```

## 2. client.js 模块骨架

```js
window.__ModuleLoader__.load({
  id: '<包名>',                     // 模块 id，与 package.json 的 name 一致
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

## 8. 本机打开 / 在文件夹中显示（复用 open-in-app）

**不要自己拼 `explorer /select` 或 `start` 命令**。核心已把「用哪个应用打开、在文件管理器中定位」
封装成 Session Remote，浏览器插件直接调用即可（v1.2.0 起本仓库插件已用）：

```js
// factory 返回的 inject 必须带这两个服务
return { inject: ['slots', 'locale', 'remote', 'remote.session'], apply };

// 能力探测（纯 Web 部署为 false，应该隐藏相关菜单）
const ok = (await ctx.remote.session.canOpenWorkspacePath()).value;

// 默认应用打开（HTML 即默认浏览器；文件夹即文件管理器）
await ctx.remote.session.openWorkspacePath({ path: absolute });

// 在文件管理器中定位 / 选中
await ctx.remote.session.openWorkspacePath({ path: absolute, action: 'reveal' });

// 列出该文件的全部已注册处理器：{ id, name, default, icon(data: URL) }
const apps = (await ctx.remote.session.workspacePathApplications({ path: absolute })).value;
// 用指定处理器打开（application 必须是上面返回的 id）
await ctx.remote.session.openWorkspacePath({ path: absolute, application: app.id });
```

返回体均为 `{ ok: true, value }` / `{ ok: false, error }`；失败要显示可见反馈。
`package.json` 的 `dsh.client.inject` 需同时声明 `@deepseek-ai/dsh-api-gateway`、
`@deepseek-ai/dsh-api-remotes`、`@deepseek-ai/dsh-api-session-controller`，否则回退到 `ctx.remote`
可能尚未就绪（看到 `ctx.remote` 为空就查这里）。

> 「打开方式…」二级菜单已从本仓库插件移除（用户不需要），但上面的 `workspacePathApplications`
> API 仍可用于其他插件；本插件只保留「用浏览器打开」时对浏览器的自动选择。

## 9. 在 DSH 右侧面板中预览文件

文件树里的「在 DSH 中预览」使用公开的 Sidebar 服务，不要自己造 tab：

```js
// factory 的 inject 必须带 sidebarRight，并依赖 @deepseek-ai/dsh-client-ui-sidebar-right
const address = 'dsh-resource://file/session/' + encodeURIComponent(sessionId) + '/' +
  relativePath.split('/').map((s) => encodeURIComponent(s).replace(/%3A/gi, ':')).join('/');
ctx.sidebarRight.openResource(address);
```

- `sessionId` 从 slot props 捕获；路径相对该 Session 的 `cwd`。
- 绝对路径或工作区外路径也可以直接放进地址，Sidebar 会按 Session 解析。
- 参考实现见 `@deepseek-ai/dsh-client-ui-reference` 的 `fileAddressFor` / `sessionFileAddress`。

## 10. Host 自定义文件操作 / 终端

Client 渲染进程没有任意文件写、重命名、删除权限；需要时在 Host 半部注册认证路由：

```js
export const inject = ['connection'];
export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/dft.fileops',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handle(request)
  }), 'my-plugin: host file operations');
}
```

- 请求体用 `await request.json()`；响应统一 `Response.json({ ok, error }, { status })`。
- 所有目标路径必须用 `path.relative(root, target)` 校验在传入的工作区根目录内，拒绝 `..` 越权。
- 新建：`fs.mkdir` / `fs.writeFile(target, '', { flag: 'wx' })`；重命名：`fs.rename`（目标已存在返回 409）。
- 删除到 Windows 回收站：
  `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile/DeleteDirectory(path, 'OnlyErrorDialogs', 'SendToRecycleBin')`。
- 外部终端：Host 用 `spawn('cmd.exe', ['/d','/s','/c', 'start "" powershell.exe -NoExit -Command "Set-Location -LiteralPath $env:DSH_DFT_DIR"'], { env: { ...process.env, DSH_DFT_DIR: target }, detached: true, stdio: 'ignore' })`，
  路径通过环境变量传入，避免命令拼接注入。
- 纯 Web / 非 Windows 环境必须返回明确错误，Client 显示失败反馈。

### Git 状态路由

同一套认证路由可以给文件树补 Git 状态（参考 `plugins/dsh-file-tree/index.js`）：

```js
const raw = await execFileAsync('git', ['-C', root, 'status', '--porcelain=v2', '--branch',
  '--ahead-behind', '-z', '--untracked-files=all'], {
  cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024,
  env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
});
```

- `-z` 下记录以 NUL 分隔；`1` 行 8 个固定字段，`2`（重命名/复制）9 个且**紧跟原路径**，`u` 10 个，`? ` 是未跟踪。
- `--branch` 同时输出 `# branch.head`、`# branch.upstream`、`# branch.ab +A -B`。
- 先 `git rev-parse --show-toplevel` 找仓库根，再传相对 pathspec，只返回工作区子树内的路径。
- 仓库根/工作区可能是子目录，返回的 porcelain 路径相对**仓库根**，客户端要再换算成工作区相对路径。
- 非 Git 仓库返回 `{ ok: true, isRepo: false }`，不要当错误；Git 未安装同理。
- 客户端不要改 React 文件树 DOM，只给宿主自己的 `li[data-files-path]` 行加属性、用 CSS 着色/伪元素徽标；
  观察 DOM 变更做增量重绘。

## 11. Host 策略插件：失败重试与自动续跑

参考实现：`plugins/auto-retry/`（Host-only，无 `client.js`，`node --test test/` 覆盖行为）。
所有接口都用 `cordis_inspect_query` 的 `Event` / `Service` 核实过。

### 11.1 事件与作用域

| 事件 / 服务 | 模式 | 载荷 |
|---|---|---|
| `agent/request-error` | waterfall | `{ agent, turn, step, provider, failure: LlmFailure, retryPolicy, signal }` |
| `session/event` | emit | `(session, event)`，`event.type === 'turn/end'` 时 `event.data.reason.kind` ∈ `completed/error/aborted/blocked/interrupted/max-tokens/forked` |
| `agent/inbox/inserted` | emit | `{ agent, message }` |
| `agent/disposed` | emit | `{ agent }` |
| `ctx.agents` | Service | `get(id)` / `list()` / `roots()` |
| `agent` 句柄 | — | `status`（`idle`/`running`）、`session`、`followup(message)`、`steer()`、`inject()`、`cancel()`、`whenIdle()` |

**根上下文注册的 `ctx.on('agent/xxx')` 会收到所有 agent 的事件**（agent 作用域只过滤注册在
`agent.ctx` 上的监听）。看 `@deepseek-ai/dsh-goal-round-driver` 的 `apply()` 即知：
它在插件根上下文监听 `agent/pre-step` / `agent/inbox/inserted` 并驱动全部会话。

### 11.2 让失败的模型请求重试

`agent-loop` 的 `step()` 在一个 `while (true)` 里请求模型；失败时分发 waterfall，
**监听器返回 `{ kind: 'retry' }` 即继续同一请求，不重新追加用户消息**（因此无副作用重复）：

```js
ctx.on('agent/request-error', async ({ agent, turn, step, failure, signal }, next) => {
  if (signal.aborted) return next();              // 用户停止：不要重试
  if (classify(failure) !== 'transient') return next();
  await sleep(delay, signal);                     // 退避 + 抖动，尊重 providerRetryAfterMs
  return { kind: 'retry' };
});
```

要点：

- **必须 `await next()` 或返回 `{kind:'retry'}`**；不调用 `next()` 就是自己接管恢复。
- 保持同一 `signal`：abort 后 loop 会立刻 `throwIfAborted()`，不要遮住用户的停止。
- 加次数上限（按 `turn:step` 计数），否则一次持续故障会无限重试。
- 需要优雅退避时用 `unref()` 的定时器 + `signal` 竞速，别让退出被挂起的重试拖住。

### 11.3 整轮失败后自动续跑

`turn/end` 的 `reason.kind === 'error'` 才是「这一轮真的失败了」；`aborted`（用户停止）、
`blocked`（pre-step 拒绝）、`max-tokens` 都不应该自动续跑。续跑要点：

```js
const message = deepFreeze({
  id: randomUUID(), role: 'user',
  content: [{ type: 'text', text: '<auto_resume>…</auto_resume>' }],
  source: { kind: '<plugin-id>', attempt }        // 自定义 kind 合法，用于识别自己的消息
});
agent.followup(message);
```

- **必须等 agent 变成 `idle` 再 `followup`**：`turn/end` 在 `turn()` 的 `finally` 里提交，
  此时 `status` 仍是 `running`，且 driver 有个唤醒竞态——在 running 期间 `followup` 会把消息
  排进 inbox 却**不会**唤醒 driver，消息就卡住。用延时定时器，回调里再校验
  `ctx.agents.get(id) === agent && agent.status === 'idle'`。
- 想少依赖宿主内部包时，不要 `import { createUserMessage } from '@deepseek-ai/dsh-llm'`
  （profile 里没有 `@deepseek-ai`，裸 import 解析不到）；按上面的形状自己构造并深冻结即可。
- 预算要用**连续失败**计数，任一非 error 轮次结束就清零；用户发言也清零并取消待续跑。
- 卸载时清空所有待发定时器，否则插件卸载后还会往会话里塞消息。

## 12. 版本与发版策略

**只有用户明确说「发版 / release / 升版本」时才执行 bump、tag、Release 与市场索引刷新。**
日常改代码只提交，不自动发版；当前本仓库插件统一为 **1.0.0**，旧的 1.1.0 / 1.2.0 编号已废弃。
需要发版时仍用 `node scripts\release.mjs <name> patch|minor|major "摘要" [--push]`。
