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

## 8. 存量兼容与迁移

**风险**：线上 `model.models.protocol` 实际存什么值，本设计写作时无法查看。
若存的是 `doubao` / `openai` / `v1` 这类，直接切换会让这些模型全部
`MODEL_NOT_ROUTABLE`。

因此**必须**保留 §7 第 3 步的回退，并分三步收紧：

1. **影子读**：上线分发改造，protocol 无法识别时回退到 provider_code Map，
   打 WARN 日志并记一个计数指标 `atlas_router_protocol_fallback_total`。
   此时行为与今天完全一致，零风险。
2. **盘点与回填**：
   ```sql
   SELECT protocol, count(*) FROM model.models
   WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC;
   ```
   按 §5 词表回填（通过 `/capability/models` 更新，不直接改库）。
   以第 1 步的指标归零作为回填完成的判据。
3. **收紧**：`/capability/models` 写路径开始校验 protocol 属于词表；回退层
   保留但降级为异常路径。

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
| **P3** | 存量收紧（§8 第 3 步） | 回退指标归零后启用严格校验 |

P0 与 P1 之间可以发版，P0 本身不改变任何外部行为。

## 12. 未决问题

1. **存量 protocol 取值**——§8 的盘点 SQL 需要一次真实执行，结果决定回填工
   作量，也决定 P3 何时能做。
2. **`probe` 的计费归属**——自检请求会真实消耗 token。计入哪个租户？建议
   记为 `usage_type='test'`（`reqlog.request_records` 已有该取值），但归属
   哪个 tenant 需要决定。
3. **通用适配器的指标标签基数**——provider code 从类常量变成运行时值，
   `component`/`provider` 标签的取值集合随注册表增长。需确认 Prometheus 侧
   可接受。
4. **`wire` schema 的版本演进**——封闭 schema 意味着新增键要发版。是否需要
   一个 `wire.schemaVersion` 以便旧服务读新配置时安全降级。
