# 当前状态（快照 2026-11-04）

> 新会话进本仓库时，读这一页 + [plugin-dev-guide.md](plugin-dev-guide.md) 即可接续。
> 安装见 [install.md](install.md)，发版见 [publishing.md](publishing.md)。

## 一句话状态

三个插件（`auto-retry` / `composer-skill-picker` / `file-tree-context-menu`）已统一到
**1.0.1**，包名从 `@local/*` 改为可直接发布的 `dsh-*`，**同时上线了三条分发渠道**：
git tag + GitHub Release、公共 npm、GitHub Pages 市场索引。本机 desktop profile 以 `link:`
装在源码目录，三个条目均为 `fiberPhase: active`。

## 插件状态

| 目录 | npm 包名 | 版本 | tag（commit） | 本机安装 |
|---|---|---|---|---|
| `plugins/auto-retry` | `dsh-auto-retry` | 1.0.1 | `auto-retry-v1.0.1`（`fb77d67`） | link，active |
| `plugins/composer-skill-picker` | `dsh-composer-skill-picker` | 1.0.1 | `composer-skill-picker-v1.0.1`（`e30c3b2`） | link，active |
| `plugins/file-tree-context-menu` | `dsh-file-tree-context-menu` | 1.0.1 | `file-tree-context-menu-v1.0.1`（`2d3e8e1`） | link，active |
| `plugins/n1n-prompt-tools` | `dsh-n1n-prompt-tools` | 1.0.0 | 未发版（本地 1.0.0） | link，待安装验证 |

- 公共 npm：`latest` 均为 `1.0.1`，已实测 `npm i` 三个包可装在干净目录。
  npm 包页同时残留一个 `0.0.0-stage` 占位版本（staged publishing 产物，见
  [publishing.md](publishing.md#账号层面的两个坑已踩过)），不影响安装。
- 市场索引：<https://mark930209.github.io/GoDSH/market-index.json>（实测 200，3 条，均 1.0.1）。
- 旧 tag `*-v1.0.0` 与对应 Release 保留为历史，索引只列当前 `package.json` 版本。

## 环境事实

| 项 | 值 |
|---|---|
| 远程仓库 | `https://github.com/Mark930209/GoDSH`（`origin`，分支 `main`；fetch 走 HTTPS，push 走 SSH） |
| GitHub 认证 | SSH key `C:\Users\congzhisen\.ssh\github_guima`（`~/.ssh/config` 已配 `Host github.com`）；HTTPS PAT 存于 Windows 凭据管理器 |
| 本仓库 | `E:\Projects\DSH_Plugins_Dev` |
| git 身份（本仓库 local） | `Mark930209` / `guimaxingtian@163.com` |
| DSH 安装目录 | `E:\Users\congzhisen\AppData\Local\Programs\DeepSeek Harness` |
| DSH 实现 checkout | `…\resources\app.asar\dsh`（**asar 归档**：PowerShell 读不到内部，只能用 DSH 的 read 工具/grep） |
| profile | `desktop`（`C:\Users\congzhisen\.dsh\profiles\desktop`） |
| 插件安装方式 | `link:E:/Projects/DSH_Plugins_Dev/plugins/<目录名>` |
| npm 账号 / token | `guimaxingtian`，`~/.npmrc` 存 `//registry.npmjs.org/:_authToken`（Classic → Automation）；本机默认 registry 是内网镜像 `http://10.66.12.81:4873/`，发布必须显式 `--registry=https://registry.npmjs.org/` |
| Node / Git / npm | v24.15.0 / 2.46.0 / 11.12.1 |
| 验证基线 | DSH `0.2.1-rc.5`，Windows 桌面端 |

## 已完成（时间线）

- **2026-11-03 · 仓库 GitHub 化**：`origin` 指向 GoDSH；CI（`validate` / `release` / `pages`）、
  `scripts/validate-plugins.mjs`、`scripts/release.mjs`、`scripts/make-market-index.mjs`、
  `repo.config.json` 单一配置源；GitHub Pages 托管市场索引。
- **2026-11-03 · `file-tree-context-menu` 1.0.0**：右键加入对话（引用芯片）、复制 `@` 引用 / 路径 /
  `file://` / Markdown 链接、DSH 内预览、终端打开、AI 总结/解释、新建/重命名/回收站删除、多选批量；
  移除「打开方式…」。Host 侧有 `POST /api/ftcm.fileops`（工作区根校验）。
- **2026-11-03 · `composer-skill-picker` 1.0.0**：输入框工具行常驻「技能」下拉框
  （`conversation.input.left`，order 80，样式对齐内置模型选择器）；
  发现 `.dsh/skills`、`.agents/skills`，选中即插入 `/技能名 ` 并交还焦点。
- **2026-11-03 · `auto-retry` 1.0.0**（Host-only，无 UI）：
  - 第 1 层 `agent/request-error`：指数退避 + 抖动重试，尊重 `providerRetryAfterMs`，
    按 `turn:step` 计到 `maxRequestRetries`（默认 6）。
  - 第 2 层 `turn/end`（`reason.kind === 'error'`）：延时 `agent.followup()` 一条 `<auto_resume>`
    续跑，计到 `maxConsecutiveResumes`（默认 5）；`completed`/`aborted`/`blocked` 清零预算。
  - 失败分类：5xx 与 408/409/425/429 可重试；`AUTH`/`API_KEY`/`QUOTA`/`CONTEXT_LENGTH` 等不可重试 code
    优先于状态码判定。
  - 安全边界：`aborted`（用户停止）不续跑；`pauseOnUserInput` 下用户发言取消待续跑；
    卸载清空全部定时器。不 import 任何 `@deepseek-ai/*`（`inject = ['agents']`）。
  - 13 项行为测试：`node --test test/auto-retry.test.mjs`。
- **2026-11-04 · 可见的重试提示**：重试前写 `llm/retry`、等待结束写 `llm/retry-started`，
  复用宿主 `client-ui-chat` 的 `RetryNodeView`，对话里出现「正在重试模型请求（1/6） · 3s」
  （倒计时、可展开看失败原因与延迟、停止后变「已取消」）。
  `policyKey` 用 `auto-retry`，与内置 `llm-retry` 的计数互不干扰；`session.append` 抛错只记日志。
- **2026-11-04 · 单插件独立发布**：索引改为**按 tag 钉版本**，发一个插件不再顺带发布其他插件；
  `release.mjs` 增加 `tag-only` 模式。
- **2026-11-04 · 改名并发布 npm**：`@local/*` → `dsh-auto-retry` / `dsh-composer-skill-picker` /
  `dsh-file-tree-context-menu`，去掉 `private`，三个包 1.0.1 已上公共 npm；
  本机 profile 依赖键同步换名。
- **2026-11-04 · 仓库梳理**：安装方法抽成 [install.md](install.md)，交接文档并入本页，
  `CONTRIBUTING.md` 迁入 `docs/contributing.md`，`AGENTS.md` 转为本地私有（进 `.gitignore`）。
- **2026-11-05 · `n1n-prompt-tools` 语法扩容（本地未发版，未提交版本号）**：实测 n1n 下 8 个模型，
  补齐第三种方言 `<tool_call>`（JSON 信封体与 `<function=…><parameter=…>` 标签体，参数按出站
  捕获的 Schema 强转）；`extractInvokeCall` 改为边界扫描，容忍模型把闭合标签写坏
  （用 `｜DSML｜>` 顶替规范写法）；新增 `autoDetect`（回复出现调用语法却没解析出调用 → 该路由
  降级原生 tools）、`denyModels` 黑名单、`parseStrippedRoutes` 兜底。实测 5/9 模型原生遵循
  `@@TOOL@@`，2 个靠新解析器可用，`glm-5.3` 与 `kimi-k3` 不可用。**模态与协议遵从无关**：
  `qwen3.8-max-0902` 支持图像却不认文本协议，`glm-5.3-flash` 纯文本反而认。44 项测试。
  注意：改了 `index.js`/`cordis.patch.yml` 必须**重启 DSH** 才生效（进程不热重载 host 插件代码）。

- **2026-11-05 · `n1n-prompt-tools` 1.0.0（新增，本地未发版）**：解决 native `tools` 字段吃掉
  前缀缓存的问题（**只针对 n1n 网关**，原名 `prompt-tools` 因定位收窄而改名）。出站
  `system-prompt/assemble` 把工具清单确定性渲染进系统提示词并清空 `assembly.tools`；入站
  `llm/stream` 把模型输出的文本调用解析回标准 `tool-call` 块，**两种语法都认**：
  `@@TOOL@@ {...}` 与模型漏出的 XML `<｜DSML｜ invoke ...>` 形式（跨 chunk、字符串转义、
  代码围栏、多调用、扁平参数容错）。**供应商硬限制**：只作用于 `provider === 'n1n'`，
  `resolveOptions` 把配置里混入的其它 provider 丢弃、`routeAllowed` 拒绝非 n1n 路由、
  出站入站双水位各自校验，且**移除了「空数组 = 全部 provider」的开关**（空数组 = 不生效）；
  另加可选 `models` 白名单（n1n 内 `glm-5.3` 不遵循文本协议，需排除）。30 项单元测试
  （其中 8 项专门测这道闸门，含 3 项直接跑 `apply()` 两个 hook 的端到端断言）；`deepseek-v4.1-flash` 实测协议可被正确解析，本会话 `tools`
  字段已消失、命中率 98~99%。
  注：受控 A/B 显示 `tools` 字段并非真实长会话缓存塌陷的唯一/主要成因（更像网关多后端随机
  未命中），插件保证“连续确定性文本前缀”这一前提，详见插件 README 的实测结论。

## 待办

1. **人工冒烟（最有价值）**：重启 DSH 后逐项确认
   - 右键菜单：加入对话芯片、复制链接、DSH 预览、终端、新建/重命名/回收站、多选；
   - 技能下拉框：`E:\5_8U\Cybertron` 会话应列出项目技能，本仓库应显示「当前项目没有技能」；
   - **auto-retry 真实故障**：断网/VPN 触发模型失败 → 应看到「正在重试模型请求（n/6） · Ns」；
     整轮失败则应看到 `[auto-retry] ... resume 1/5 scheduling in ...ms` 且约 5s 后自动续跑；
     用户抢话应取消待续跑；点停止不应续跑。
2. `docs/publishing.md` 记录的两个 npm 账号坑若再遇到，按文档处理（2FA token / `0.0.0-stage` 占位）。
3. **`n1n-prompt-tools` 冒烟**：装到 desktop profile 后，在 n1n 的会话里让模型做一次工具调用
   （如读取文件），确认：工具真的执行、UI 正常显示、会话记录里 assistant 是 `tool-call` 块；
   再观察多步 `cache_read` 是否随上下文增长。若模型不遵循文本协议则把该 provider 从 `providers` 移除。
4. 可选：在 npmjs.com 用 2FA 手动删掉三个包的 `0.0.0-stage` 占位版本，让包页干净。
5. 计划新插件：`node scripts\new-plugin.mjs dsh-xxx`。

## 恢复记录（2026-11-03 误删事故）

经过与教训见 [repo-layout.md](repo-layout.md#事故复盘2026-11-03-误删插件源文件)。
一句话：**改完就 `git commit`**，不要对唯一副本做「移动 + 清理」的组合操作。
