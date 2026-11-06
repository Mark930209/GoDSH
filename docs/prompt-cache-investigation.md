# 前缀缓存命中率调查全记录（2026-11-05 ~ 11-06）

> 这是一份完整保留下来的调查报告与可复现方法，不依赖任何已删除的插件。
> 所有实验针对 `llm-api.net`（OpenAI 兼容网关，`api: openai-completions`）与
> `deepseek-v4.1-flash`，凭据取自 `~/.dsh/.credentials.yaml` 的 `N1N_API_KEY`。
> 配套脚本都在 `scripts/_cache_*.mjs`，会话日志读法见
> [dsh-conversation-internals.md](dsh-conversation-internals.md)。

## 一句话结论

**该网关的 prompt cache 对请求形态不敏感：工具目录放 `tools` 字段还是放系统提示词文本里，
命中率没有任何可重复的差异。** 真正会毁掉命中率的只有两件事：**请求前缀被改写**（尤其是
工具可用性的开/关切换）与**网关自身的随机驱逐**。任何"加亲和头 / 加长 TTL / 换缓存保留档"
的尝试全部无效。给公司的操作建议见文末。

## 背景与被推翻的立论

参考插件 `dsh-llm-text-tools` 的 README 给出过一张著名的对比表：

| 请求形态 | 第 2 步 cache_read | 第 3 步 |
| --- | --- | --- |
| 原生 `tools` 字段（约 7.4K tokens） | 4,096 / 8,696 | 4,096 / 9,909（**不再增长**） |
| tools 渲染成系统提示词文本 | 6,784 / 8,065（84%） | 8,064 / 9,277（87%，随对话增长） |

即「`tools` 字段把缓存钉死在固定头部，对话历史每步全量重算」。**2026-11 重测，该现象在
`llm-api.net` 上完全复现不出来**（下文实验 6–9），推测网关后来改进了实现。引用这篇参考
插件立论的文章/文档已过时，不宜再作为依据。

## 命中率口径

```
命中率 = cacheReadTokens / (inputTokens + cacheReadTokens)
```

- DSH 会话日志里 `assistant/message` 事件的 `data.usage` 直接给出
  `inputTokens / cacheReadTokens`（网关字段是 `prompt_tokens_details.cached_tokens`）。
- 网关返回非流式 usage 需要 `stream_options.include_usage = true`。
- **粒度特征**：`cached` 总是 128（或 1024）的倍数。`cached=128` 不是"命中了 128 个
  token 的真内容"，而是"几乎没命中"的舍入下限，别把它当成命中信号。

## 实验清单（全部可在本机复现，脚本名在最后）

### 1. 会话内相关性：前缀漂移 vs 命中率（`_cache_correlate.mjs`）

真实会话 238 个请求，按插件诊断日志把每个请求标注为前缀变/没变：

- `prefix changed`：n=5，miss 4
- `prefix stable`：n=220，miss 129

133 个 miss 里只有 4 个能归因于插件造成的前缀漂移。**"插件改写前缀所以毁缓存"这个
担忧当时就被数据否定**。

### 2. 命中率与上下文大小无关（`_cache_timeline2.mjs`）

按 5 分钟墙钟分桶，09:25–10:10Z 是 0–6%，13:25–13:40Z 是 94/95/94/71%——同一个会话、
同一种请求形态，命中率可以相差几十倍，**随时间走而不是随大小走**。turn 1 内部
"较小的半步 8% vs 较大的半步 18%"进一步否定了"上下文越大越差"。

### 3. 会话历史的转移矩阵（`_cache_stats.mjs`）

同一会话 `P(miss | 上一请求 miss)=90%`、`P(miss | 上一请求 hit)=12%`，
`miss→miss 120 次`、`hit→hit 92 次`。含义：**命中率状态是按时间段聚集的**，一旦进入
"冷时段"会连续冷下去。这也是后来定位"插件损坏期"的线索来源。

### 4. TTL / 缓存保留档（`_cache_ttl.mjs`、`_cache_ttl2.mjs`）

- 两臂相同前缀，间隔 6 分钟后重放：reuse 仍是 94%。
- turn 4→5 间隔 **105 分钟**后仍 94%。
- `prompt_cache_retention: "none"|"short"|"long"` 对命中完全无影响。
- asar 源码事实：适配器只在 `baseUrl.includes("api.openai.com")` 或
  `cacheRetention==="long" && supportsLongCacheRetention` 时才发 `prompt_cache_key`。
  n1n 路由默认**两个条件都不满足**，什么都不发——所以"DSH 没发缓存键"不是问题，
  发了也没用（见实验 5）。

TTL 不是瓶颈：网关缓存至少活 100+ 分钟。

### 5. 亲和头与路由分组（`_cache_affinity_probe.mjs`、`_cache_headers.mjs`、
`_cache_routing_group.mjs`、`_cache_ab_interleaved.mjs`）

- 响应头只有 `x-routing-group: Self-Deployed-2`、`x-routing-priority: auto`、
  `x-routing-source: token`、`x-api-request-id`，没有后端实例标识。
- 固定前缀连发 18 次：`x-routing-group` **18 次全同**，从未切换路由组——"多后端轮询
  导致粘性未命中"假设被证伪。
- 交错 A/B（`x-session-affinity` + `session_id` + `prompt_cache_key` +
  `x-client-request-id`）：
  - 20 轮：baseline 90% vs affinity 100%
  - 45 轮：baseline **96%** vs affinity **89%**（方向翻转）
  - 合并即无差异。亲和头没用。
- 注意：相同 body 重放时，同一 arm 内部也会出现孤立 0%（18 次里 5 次），路由组不变也
  救不了——这些 0% 是网关侧随机事件。

### 6–9. 最终判定实验（回答"tools 字段还挡不挡缓存"）

删除插件前做的五组独立验证：

| 实验 | 设计 | 结果 |
| --- | --- | --- |
| 规模扫描（`_cache_size_sweep.mjs`） | system 300/3000/8000 tokens × 两臂逐步交错 | 两臂均 98–99%，`cached` 每步都 +128 |
| 深度扫描（`_cache_real_scale.mjs`） | 对话深度 2→29 共 4 组 | 两臂均 99%，每步 deltas 完全一致 |
| 30 轮配对分布（`_cache_paired_dist.mjs`） | 同一对话同一目录，交错 30 轮 | native 90% / text 96%；miss 失衡仅 **3 vs 1**（总量 4 次，无统计意义） |
| 大 prompt（depth 60/100） | 20–25K tokens | 两臂 99–100% |
| 真实规模（`_steps_usage.mjs` 对账） | 生产会话 prompt 已到 **120K tokens** | 稳态每步 98–100%，`prefixHash` 9 次请求恒定 |

判定依据：**孤立的 0% 步骤两臂都会随机出现**（native 臂在 depth 100 也吃到一次），
且出现时请求前缀完全没变。它们是网关侧驱逐，不是请求形态属性。

## 模式切换的真实代价（`_cache_switch_cost.mjs`、`_cache_window_compare.mjs`）

工具可用性切换（原生 `tools` ⇄ 文本目录）会改写请求前缀，**切换后的第一个请求必凉**：
实测 3 次切换，第一个请求命中率 0%、0%、1%（3/3）。但**切换之后的两种模式本身命中率
相同**（同一健康窗口内 text 94% vs native 94%）。

> 教训（辛普森悖论）：我中途曾得出"native 模式持续冷 18 个百分点"的错误结论，原因是
> native 请求段恰好覆盖了插件故障时段。分桶统计必须先按"健康/故障时段"分层再比较，
> 否则会把时段效应误读成模式效应。

## 网关行为备忘（llm-api.net）

- 畸形 `tools` 数组（缺 `type:"function"` 包装）返回 **503 new_api_error**，不是 400——
  排查时极易误判为"网关瞬时不可用"。tools 必须是 `{type:"function", function:{...}}`。
- 503 `The model service is temporarily unavailable` 确实是瞬时故障，重试即可。
- 不实现 `prompt_cache_retention`；非 `api.openai.com` 不发 `prompt_cache_key` 也照样
  命中（说明网关按自己的方式做前缀匹配）。
- `x-routing-group` 可作为后端分组观察，但本路由组从不变化。

## 给公司的缓存操作建议

1. **保持请求前缀逐字节稳定**：系统提示词（含工具目录文本，如果用的话）必须确定性——
   工具按名字排序、JSON Schema 键递归排序、绝不塞时间戳/随机 id。这是唯一有实质收益的事。
2. **别在会话中途切换工具可用性**。任何 `tools` 有/无、内容增减都会作废前缀，至少
   多付一次全额 input。工具集要变，宁可开新会话。
3. **别为缓存去加 header**（`prompt_cache_key`、亲和头、`session_id`）——对该网关无效。
4. **别为缓存去设 retention/TTL**——网关缓存活 100+ 分钟，不是瓶颈。
5. **把 0% 当噪声看待**：即使前缀完全不变、路由组不变，也会有低个位数比例的随机完全
   未命中；监控时按时间窗看，别对单次 0% 报警。
6. 健康基线：该网关上 DSH 会话稳态命中率 **94–99%**（120K tokens 上下文同样如此）。
   明显低于这个区间时，先查"这段时间是不是有什么在改写前缀"，再怀疑大小。

## 测量陷阱清单（都踩过）

- **别按关键字粗筛"协议泄漏"**：正文里正常提及 `@@TOOL@@`、`DSML` 等字面量会污染统计
  （判"是否调用尝试"必须要求 body 形态 + 剔除代码块，见
  [text-tool-protocol.md](text-tool-protocol.md)）。
- **A/B 必须交错**：网关状态随墙钟漂移，先后跑两臂会把臂效应和时段效应混在一起。
- **`cached=128` 是下限不是命中**。
- **zstd 会话日志按帧独立解压**，坏帧只影响该帧（读法见
  [dsh-conversation-internals.md](dsh-conversation-internals.md)）。
- PowerShell 5.1 的 `Set-Content -Encoding UTF8` 会写坏中文 UTF-8 文件（BOM + 转码
  双重问题），改文件用编辑工具或 `node`。
- DSH 安装目录名含空格/特殊字符且会被 harness 改名，脚本里必须 `readdirSync` 动态解析
  `...\Programs\<install>\resources\app.asar`，硬编码字面量会 ENOENT。

## 脚本索引

| 脚本 | 用途 |
| --- | --- |
| `scripts/_steps_usage.mjs` | 把会话日志逐 step 打成 turn/step/prompt/cached/rate 表（对账首选） |
| `scripts/_cache_window_compare.mjs` | 指定时间窗后，按 text/native 模式分组统计命中率（含 steady-state 过滤） |
| `scripts/_cache_switch_cost.mjs` | 按"距上次模式切换的第 N 个请求"分解命中率 |
| `scripts/_cache_correlate.mjs` | 前缀变/没变 vs 命中率相关性 |
| `scripts/_cache_stats.mjs` | 会话 miss/hit 转移矩阵 |
| `scripts/_cache_timeline2.mjs` | 按时间桶/按 turn 的命中率时间线 |
| `scripts/_cache_ttl.mjs` / `_cache_ttl2.mjs` | TTL 与 retention 档位双臂实验 |
| `scripts/_cache_affinity_probe.mjs` / `_cache_headers.mjs` / `_cache_ab_interleaved.mjs` | 亲和头 A/B |
| `scripts/_cache_routing_group.mjs` | 路由组 vs 命中率采样 |
| `scripts/_cache_growing_probe.mjs` | 追加式增长请求命中率（含强制短连接） |
| `scripts/_cache_drivers.mjs` | 会话内 miss 驱动因素汇总 |
| `scripts/_cache_size_sweep.mjs` | system 规模 × 两臂扫描（tools 字段立论终测） |
| `scripts/_cache_real_scale.mjs` | 真实会话消息 + 大目录两臂深度扫描 |
| `scripts/_cache_paired_dist.mjs` | 30 轮配对分布 + 未命中失衡检验 |
| `scripts/_cache_probe.mjs` / `_cache_break.mjs` / `_cache_cause.mjs` / `_cache_conditional.mjs` / `_cache_report.mjs` / `_cache_window.mjs` / `_cache_timeline.mjs` | 早期探索版本 |
| `scripts/_asar_grep.mjs` / `_asar_slice.mjs` | 在 DSH app.asar 里定位/截取源码（确认适配器行为用） |
| `scripts/_diag_catalog_stability.mjs` | 诊断日志里 catHash/prefixHash 稳定性核对 |
