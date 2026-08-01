# 100 - 模型接入与协议适配设计

**状态**：草案，待评审
**日期**：2026-08-01
**前置**：ADR-004（不引入 Portkey 依赖，自建并借鉴其声明式适配器结构）

---

## 1. 目标与非目标

**目标**：增加一个服务商或一个模型，是一次**数据操作**（管理页面 / 管理
API），不是一次代码变更与发版。

**非目标**：不追求"零代码接入任何上游"。线格式确实不同的上游必须写代码，
这是有意的——把协议差异塞进配置，最终会长出一个没人能调试的 DSL。设计的
价值在于**把边界划清楚**，而不是把边界消灭。

**另一个非目标：Atlas 只计量，不计费**（owner 决策 2026-08-01）。Atlas 负责
把"这次调用消耗了多少 token、属于谁"如实记下来；单价是运营定价的产物，落在
`model_price_rules` 里由运营维护。请求路径上不算钱，`scripts/pricing/` 下的
参考价目也只是运营设定价格时的输入，不是权威。本设计涉及 usage 的地方，一律
只讨论**数量**归集，不讨论金额。

## 2. 现状：为什么必须改

接入一家新服务商，今天要改三处代码并发一次版：

1. 新建 `service/src/providers/<name>.provider.ts`
2. `router/model-router.service.ts` 构造函数里的硬编码 Map 加一行
3. `atlas.module.ts` 的 `providers` 数组加一行

即使这家上游讲的是已经实现好的 OpenAI 方言——DeepSeek、通义、Moonshot、
SiliconFlow、vLLM、Ollama 的 OpenAI shim，全都是。

而 `model.models` 表**本来就有 `protocol varchar(64) NOT NULL` 列**：
`/capability/models` 的创建与更新接口接收它
（`model-admin.service.ts:564`、`:592`），响应里回显它（`:936`），
`AiModelRecord.protocol` 也带着它——**但没有任何代码读它做过决策**。真正的
分发是 `model-router.service.ts:35` 的 `resolve(providerName)`，查一张按
provider_code 硬编码的 Map。

这条列存在但空转，恰好说明设计意图早就在，只是没接上。

`ModelRouterService` 有四个消费方：`runtime` / `embedding` / `rerank` /
`parse`。

## 3. 三个被混为一谈的概念

`provider` 这一个词今天同时承担三件事，这是纠缠的根源：

| 概念 | 问题 | 归属 | 例子 |
|---|---|---|---|
| **谁** | 商务实体是谁 | `model_providers` 行（数据） | 火山引擎、智谱、Anthropic、某内网 vLLM |
| **怎么说** | 线格式是什么 | `protocol`（代码里的封闭词表） | OpenAI Chat Completions、Anthropic Messages |
| **有什么怪癖** | 同一线格式内的参数差异 | `config.wire` jsonb（数据） | 端点后缀、鉴权头样式、是否要 `stream_options` |

拆开之后，「接入」只动第一和第三层。

## 4. 判据

> **线格式不同 → 写代码。线格式相同、只是参数/端点/开关不同 → 写数据。**

| 差异 | 归属 | 理由 |
|---|---|---|
| 端点后缀 `/chat/completions` vs `/v1/chat` | 数据 | 同一份请求体 |
| 鉴权头 `Authorization: Bearer` vs `x-api-key` | 数据 | 同一份请求体 |
| 是否需要 `stream_options.include_usage` | 数据 | 同一份请求体，多一个开关 |
| 是否支持 tool calling / `top_p` | 数据 | 能力声明，决定是否下发字段 |
| `max_tokens` vs `max_completion_tokens` | 数据 | 字段改名，不是形状变化 |
| 模型 id 与 `model_code` 不一致 | 数据 | 已有 `config.upstreamModel` |
| 响应是 `choices[].message` vs `content[]` 块 | **代码** | 响应形状不同 |
| 流式是 `delta` chunk vs `content_block_delta` 事件 | **代码** | 事件模型不同 |
| 请求是 `messages[]` vs `contents[]` | **代码** | 请求形状不同 |
| usage 在末帧 vs 分散在两类事件 | **代码** | 归集逻辑不同 |

## 5. protocol 词表（封闭，代码枚举）

**按线格式命名，不按厂商命名。** `protocol='doubao'` 是错的——那是厂商；
`protocol='openai-chat-completions'` 才是协议。

| 值 | 适配器 | 覆盖 |
|---|---|---|
| `openai-chat-completions` | 通用 OpenAI 方言适配器 | doubao、zhipu、deepseek、qwen、moonshot、siliconflow、vLLM、Ollama shim、任何 OpenAI 兼容网关 |
| `anthropic-messages` | Claude 适配器 | Anthropic 官方及其兼容代理 |

预留（未实现，加入时才写代码）：`gemini-generate-content`、
`bedrock-converse`。

归一化接受少量别名（`openai` / `openai-compatible` 归一到
`openai-chat-completions`），大小写与连字符不敏感——存量数据里大概率有这些
写法，见 §8。

## 6. 怪癖描述符：`config.wire`

`model_providers.config` 与 `model.models.config` **两个 jsonb 列都已存在**，
所以这一层是**零 DDL** 的。约定一个 `wire` 子对象：

```jsonc
// model_providers.config（服务商级默认）
{
  "wire": {
    "schemaVersion": 1,                     // 必填，见 §12.4
    "chatPath": "/chat/completions",
    "auth": { "style": "bearer" },          // bearer | x-api-key | header
    "streamUsage": "stream_options",        // stream_options | native | none
    "supports": {
      "tools": true,
      "toolChoice": true,
      "topP": true
    },
    "paramMap": {                            // 仅记录与规范名不同的
      "maxTokens": "max_tokens"
    }
  }
}

// model.models.config（模型级覆盖，深合并盖住服务商级）
{
  "upstreamModel": "doubao-seed-1-6-250615",
  "wire": { "supports": { "tools": false } }
}
```

合并顺序：**适配器内置默认 ← 服务商 `config.wire` ← 模型 `config.wire`**。

已有的两个 config 键收编进这套约定：`upstreamModel` 保持顶层不动（它不是线
格式怪癖，是模型标识）；`anthropicVersion` 迁入
`wire.headers["anthropic-version"]`，保留读旧键的兼容。

**`wire` 是一个封闭 schema，不是自由字典。** 适配器只认它声明的键，未知键
在写入时就拒绝——否则这里会变成第二个"什么都能塞"的黑洞。校验放在
`/capability/providers`、`/capability/models` 的写路径上，不是运行时。

写入时严格、运行时宽松：运营改配置比服务发版快，一个旧版本服务读到新版本
写入的键，应当忽略并告警，而不是让一个正在跑的模型停摆。`schemaVersion`
就是这条规则的载体，见 §12.4。

## 7. 分发解析

```
resolve(model: AiModelRecord): IModelProvider
  1. byProviderCode[model.provider]              // 特例层：zhipu 的 embed/rerank
  2. byProtocol[normalizeProtocol(model.protocol)]  // 通用层
  3. legacyProviderCodeMap[model.provider] + warn   // 存量兼容，见 §8
  4. throw MODEL_NOT_ROUTABLE
```

为什么保留第 1 层：`ZhipuProvider` 覆盖了 `embed` 与 `rerank`（真实的智谱
Embedding-3 / rerank API），这些**不是** OpenAI Chat Completions 协议的一
部分。特例层的存在意义是"这家在通用协议之外还多支持了别的能力"，不是"这家
的 chat 有点不一样"——后者属于 §6 的 `wire`。

`resolve()` 的入参从 `(providerName, modelCode)` 改为整个 `AiModelRecord`
（四个消费方同步改），因为分发现在需要 `protocol` 和 `config`。

通用适配器不再有类级 `providerName` 常量——它服务于多家服务商。provider
code 通过 `ProviderChatRequest.providerCode`（新增字段）传入，用于错误信息与
指标标签。

## 8. 存量盘点（已执行）

盘点于 2026-08-01 在 `vxturestudio_platform_main` 的 `model` schema 上执行
（数据层迁移到 `vxturestudio_modelruntime_main` 尚未进行，所以这里仍是权威
现状）。

**`protocol` 取值**：

| protocol | 行数 |
|---|---|
| `openai` | 2 |
| `anthropic` | 1 |

**全量注册表**：

| model_code | protocol | provider_code | model_type | config |
|---|---|---|---|---|
| `claude-sonnet-4` | anthropic | anthropic | chat | NULL |
| `doubao-pro-32k` | openai | doubao | chat | NULL |
| `gpt-4o` | openai | openai | chat | NULL |

服务商 3 行（anthropic / doubao / openai），`config` 均为 NULL。
grants **0** 行，policies **0** 行，price_rules 3 行且单价全为 0。

**结论：迁移风险基本不存在。**

- 两个取值都被 §5 的别名规则直接覆盖（`openai` -> `openai-chat-completions`，
  `anthropic` -> `anthropic-messages`），无需人工回填。
- 所有 `config` 为 NULL，没有任何存量 `wire` 或 `upstreamModel` 需要迁移。
- 只有 3 个模型，回填即使需要也是分钟级。

§7 第 3 步的回退层仍然保留，但**分三步收紧的节奏可以压缩**：本次盘点是开发
库的时点快照，生产环境可能另有数据，回退层是针对这一不确定性的保险，而不是
针对已知的脏数据。P3 可以紧随 P0，不必等一个观察期。

### 盘点顺带发现的四件事

1. **`gpt-4o` 目前路由到 `DoubaoProvider`。** 它的 `provider_code` 是
   `openai`，而 `model-router.service.ts` 的 Map 把 `"openai"` 指向
   `doubaoProvider`。能跑通纯粹因为两者都是 OpenAI 方言。这正是按厂商而非
   按协议分发的症状——改造后这不再是一个碰巧成立的巧合，而是设计本身。
2. **zhipu 和 private 一个都没注册。** 代码里有 `ZhipuProvider`（含真实的
   embed/rerank 实现）和 `PrivateModelProvider`，注册表里没有对应的服务商或
   模型。适配器存在不等于能力可用。
3. **没有任何 embedding / rerank 类型的模型。** 三行全是 `model_type='chat'`。
   所以 TD-003/TD-019 的 501 有两层原因：一层是 provider 没实现，另一层是
   **注册表里根本没有这类模型**——即使 provider 实现了，也无从路由。
4. **grants 为 0 行。** 授权表为空意味着当前没有任何租户能真正取到模型
   （`resolveCandidateModels` 依赖 grant）。这与 policies 为 0（无限流配置）
   一起说明：注册表目前处于"骨架已立、尚未投入运营"的状态。

## 9. 这个设计立刻暴露的一个真实缺陷

全代码库**没有一处**设置 `stream_options: { include_usage: true }`。

OpenAI 及多数 OpenAI 兼容上游，流式响应**默认不返回 usage**，必须显式
opt-in。而 `runtime.service.ts:390` 只在 `done` 事件携带 usage 时才调
`recordUsage`。两者相乘的结论是：**目前的流式调用很可能一次都没有被计量**
——这正是 TD-017 流式的那一半。

⚠ **待验证**：本设计写作时无 provider API key，无法联调确认各家上游的实际
默认行为。落地第一步应当是对 doubao/zhipu 各打一次真实流式请求，确认
opt-in 前后 usage 是否出现。

它同时是"怪癖属于数据"的最好例证：有的上游要 `stream_options`，有的原生就
回，有的两者都不支持只能靠预估——这三种情况用 `wire.streamUsage` 的三个取值
表达，而不是三个 if 分支。

## 10. 管理页面这一侧需要什么

Atlas 是 services profile，**没有 `portals/`**；运营界面在 `vxture-platform`
的 portals 里通过网络调用 Atlas。所以本节是**接口需求**，页面实现是平台侧
的事，需要走一次 liaison。

已具备：`/capability/providers`、`/capability/models`、`/capability/grants`、
`/capability/price-rules`、`/capability/provider-keys`（信封加密 vault，
ADR-003）。

需要补：

| 接口 | 用途 | 状态 |
|---|---|---|
| `GET /capability/protocols` | 下拉框数据源：词表 + 每个 protocol 支持的 `wire` 键与默认值 | 新增 |
| `POST/PUT /capability/models` 的 protocol 校验 | 目前是自由字符串（`requiredString`），需按词表校验 | 改造 |
| `config.wire` 的 schema 校验 | 写入时拒绝未知键，见 §6 | 新增 |
| `POST /capability/models/:id/probe` | 连通性自检：用当前配置打一次最小请求（非流式 + 流式各一次），回报能否连通、是否返回 usage | 新增 |

`probe` 是这套设计能否真正"页面化"的关键。没有它，运营在页面上配完一个模型
只能上生产流量才知道配没配对；有了它，`wire` 配错在保存时就能发现。

## 11. 分阶段落地

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P0** | 分发改造：protocol 主导 + 特例层 + 回退层 + 指标；`resolve()` 换签名，四个消费方同步 | 全量测试通过；回退指标可观测；行为与改造前一致 |
| **P1** | `wire` 描述符落地：通用适配器读取 `chatPath`/`auth`/`supports`/`paramMap`；`stream_options` 按 `streamUsage` 下发 | 用 `wire` 配出一家新 OpenAI 方言服务商，零代码；§9 的 usage 缺陷闭环 |
| **P2** | 管理面：`GET /capability/protocols`、写路径校验、`probe` 自检 | 平台侧能纯页面完成一次服务商+模型接入 |
| **P3** | 收紧：写路径按词表校验 protocol | 存量已确认可归一（§8），可紧随 P0 |

P0 与 P1 之间可以发版，P0 本身不改变任何外部行为。

## 12. 已决问题（owner 决策 2026-08-01）

1. **存量 protocol 取值** —— 已盘点，见 §8。两个取值均可别名归一，无需回填，
   P3 可紧随 P0。

2. **`probe` 自检的用量归属** —— **归平台，不属于任何租户。**
   自检请求写 `reqlog.request_records` 时：`usage_type='test'`，
   `tenant_id` / `workspace_id` 使用 `COMMERCE_SENTINEL_UUID`
   （`quota.service.ts:8` 已有的全零哨兵），且**不进入配额扣减、不上报平台
   计量内核**。判据是：这次调用是 Atlas 自己的运维行为，不是任何租户的业务
   行为，不能出现在任何租户的用量视图里。

3. **通用适配器的指标标签基数** —— **按原方案推进，无需缓解措施。**

   背景解释：Prometheus 里每一组不同的标签取值组合都会生成一条独立的时间
   序列。`provider` 从类常量（4 个固定值）变成注册表驱动的运行时值后，序列
   数会随注册的服务商数量增长。这类问题真正会出事是在标签取值达到成千上万
   时（典型反例是把 user_id 或 request_id 当标签）。

   当前注册表 3 个服务商，可预见的规模是几十个量级，与危险区差三个数量级。
   决策：正常推进；仅当注册服务商数超过约 100 时再重新评估。**前提是
   provider code 来自注册表（受控集合），绝不能把 model_code 或任何用户可控
   字符串放进标签**——这条写进实现约束。

4. **`wire` schema 版本** —— **需要。** `wire.schemaVersion` 为必填整数，
   当前值 `1`。适配器读到高于自己支持的版本时，降级为忽略不认识的键并打
   WARN，而不是拒绝服务——运营改配置的速度会快于服务发版，读不懂的新键不应
   该让一个已经在跑的模型停摆。
