# 200 - S2S Provider Surface (embedding / parse / rerank)

> 状态：v0.1 设计稿，供 Atlas 抽仓后细化；输入 = karda 提交的能力需求
> （`vxture-karda/docs/80-liaison/100-2607240931-karda-atlas-capability-requirements.md`，
> 本仓 `docs/80-liaison/00-index.md` 已记录）。
> A4（生成）已实现，契约见平台仓 `docs/30-design/platform/40-model-platform.md` §7 `ChatRequest`，本文不重述。

## 0. 定位

这是 Atlas 作为"供给方"对外暴露的 S2S 端点设计——karda/arda/varda 等调用方通过 token exchange
取得凭证后调用。四类中 A1/A2/A3 目前**能力本身未实现**，本文档把 karda 的需求转成 Atlas 侧的
设计决策；不是最终契约（最终契约需落地实现后才能定形，见 `docs/60-operations/10-tech-debt.md` TD-003）。

## 1. 通用语义（三项共用，直接采纳 karda G1-G4，非新决策）

### 1.1 G1 — 429 必须区分限流与配额耗尽（已决,可现在定）

这是一个纯设计决策,不依赖任何未建成的基础设施,现在就能定：

- **限流**（rate limit，技术速率门，对应 `model.model_policies`）→ HTTP `429`，响应体
  `{ "code": "RATE_LIMITED", "retryAfterMs": <int> }`，并带标准 `Retry-After` 头。调用方应退避重试。
- **配额耗尽**（quota exhausted，商业配额，来自平台 C2/`metering`）→ HTTP `403`（不是 429，避免调用方
  按限流语义重试打爆自己的挂起队列），响应体 `{ "code": "QUOTA_EXHAUSTED", "resetAt": "<ISO8601|null>" }`。
  调用方应把任务挂起（karda 语义：`suspended_quota`），等配额恢复自动续跑。
- 两者共用错误封套基类 `{ code, message, requestId }`，但 `code` 与 HTTP 状态码组合**永不复用**，
  调用方靠这两者的组合做分支，不解析 message 文本。

### 1.2 G2/G3 — 计量归属与唯一计量入口

- 每个 A1/A2/A3/A4 请求都带 `workspaceId`（资产归属方或触发方，按调用场景不同，见各节）+
  `tenantId`（仅 rollup）+ `applicationId`/`applicationType`（沿用 A4 现有的
  `ChatRequest.applicationId/applicationType` 字段命名，不为 A1-A3 另造一套字段名）。
- Atlas 是**推理计量唯一入口**：所有 token/次数消耗只在 Atlas 侧记账,通过 C3 consume 上报平台，
  调用方（karda 等）不重复上报模型 token 消耗。

### 1.3 G4 — service 模式凭证

- 后台批处理调用（karda 加工管线的 A1/A2）用 service 模式 token（product_210 token exchange），
  `aud`=atlas，`act.sub`=调用方服务身份；不是最终用户 OBO token。
- 在线检索调用（A3 rerank，由用户触发）可用 OBO 或 service 模式，计量记发起请求的 workspace。

## 2. A1 — Embedding

| 项 | 设计 |
|---|---|
| 端点 | `POST /v1/embed`（tailnet 面，S2S 凭证） |
| 请求 | `{ modelCode, texts: string[], workspaceId, tenantId?, applicationId?, applicationType? }` |
| 响应 | `{ modelCode, modelVersion, dimension, vectors: number[][] }`（`vectors` 与 `texts` 等长同序） |
| 版本锁定（karda A1.2/A1.3 硬约束） | `modelCode` 本身即版本化标识（如 `embed-bge-m3-v2`），不暴露 "latest" 别名；`model.models` 注册表已有 `model_code` 唯一键机制可直接复用。同一 `modelCode` 的 `dimension` 永久不变——若需要换算法/维度，注册为新 `modelCode`，旧库继续用旧 code（对齐 karda"库级锁定版本、换版本=受控重建"） |
| 批量（A1.1 硬约束） | 单请求 `texts` 数组，单批上限待定基准测试，暂定 ≤256（karda 声明单批"数百 chunk"量级，具体上限在 Phase 4 实现联调时用真实模型确认，不在此拍死） |
| 幂等（A1.6 期望） | 不做服务端幂等缓存（无状态换取更简单实现）；调用方按需自行做请求级去重 |

## 3. A2 — 解析类小模型（版面 / OCR / 表格 / 公式）

| 项 | 设计 |
|---|---|
| 端点 | `POST /v1/parse`（tailnet 面，S2S 凭证） |
| 请求 | `{ modelCode, task: "layout"|"ocr"|"table"|"formula", pages: [{ pageIndex, imageRef|imageBase64, regions?: [...] }], workspaceId, tenantId?, applicationId?, applicationType? }` |
| 响应 | 按 `task` 分形态返回：`layout`→ `blocks: [{bbox, blockType}]`；`ocr`→ `spans: [{bbox, text}]`；`table`→ `{rows, cols, cells: [{rowSpan, colSpan, text, bbox}]}`；`formula`→ `{latex, bbox}`（karda A2.4 期望的"元素树可直接消费"形态，具体字段随首个真实联调迭代） |
| 批量（A2.2 硬约束） | 单请求 `pages` 数组带多页/多区域，避免逐页往返 |
| **部署亲和（A2.3）** | **已定，可行——已确认同机部署**：平台仓 `docs/50-deployment/13-infra-allocation-registry.md` 的 atlas 行与 karda(L2) 行均登记为 `worker-02`（`100.76.219.48`，tailnet 类 2），二者是同一台物理主机、同一 tailnet 域——karda 调用 Atlas 的 `/v1/parse` 走本机回环/同域 tailnet，不经过跨机房公网路径。结论：部署亲和条件满足，karda 可以按"同机低延迟"假设设计 A2 调用路径，不需要再等待或设计跨机房降级方案。（若未来 Atlas 或 karda 任一方迁移主机，这条结论需要重新确认——本条不是永久保证，是"以 2026-07-27 的主机分配现状为准") |
| 计量 | 同 A1，workspaceId=库归属方 |

## 4. A3 — Rerank

| 项 | 设计 |
|---|---|
| 端点 | `POST /v1/rerank`（tailnet 面，S2S 凭证） |
| 请求 | `{ modelCode, query: string, candidates: [{id, text}], workspaceId, tenantId?, applicationId?, applicationType? }` |
| 响应 | `{ modelCode, scores: [{id, score}] }`（`score` 全局可比，同一 modelCode 下的分数可跨请求比较——满足 karda A3.1"不做跨索引归一"的前提） |
| 候选池上限（A3.2） | 服务端硬校验 `candidates.length <= 100`，超过直接 `400 CANDIDATE_POOL_TOO_LARGE`，不做静默截断 |
| **延迟预算（A3.3）** | **未决，需真实基准测试**——不在设计阶段承诺一个数字。karda 要求"100 候选 P95 < 400ms，若做不到请尽早给出可承诺档位"；这个数字只有拿到实际 cross-encoder 模型 + 部署硬件后压测才靠谱，现在给假数字比不给更有害。**Phase 4/5（Atlas 代码/部署到位后）第一件事之一是对 100 候选跑 P95 基准，无论结果如何都回一封函给 karda**（这是本设计doc 唯一明确要求"必须尽快给karda一个数字"的项） |
| 降级信号（A3.4 硬约束） | rerank 服务不可用时快速失败：`503 RERANK_UNAVAILABLE`（不是超时挂起），调用方按此回退到自己的 RRF 序并标 `degraded` |
| 计量 | workspaceId=触发请求的 workspace（检索场景由用户触发，不是资产归属方） |

## 5. 待回karda的事项（回函草稿见 `docs/80-liaison/`）

1. **G1（429 区分）**：本文档已给出确定设计，可以现在就回复 karda——不必等 Atlas 实现落地。
2. **A2.3（部署亲和）**：已定，可行（同机 worker-02，见上表）——本次一并回函告知结论。
3. **A3.3（rerank 延迟）**：诚实告知"暂无法给数字，需实现+压测后才能承诺，会在 Atlas 有真实部署后第一时间测给",不假装现在已经知道。

## 6. 未决清单（不在本文档拍板,留给对应 Phase）

- A1 单批 chunk 数上限、A3 rerank 真实延迟：待 Phase 4/5 有真实模型+部署后压测。
- 各端点 `modelCode` 具体注册哪些型号（如 embedding 用什么模型、rerank 用什么 cross-encoder）：产品/成本决策，不在本设计文档范围。

## 7. 租户可选模型清单 + 任务画像路由（2026-07-27 落地）

karda 提出的两项消费面前置依赖（用户模型选择器需要一个"当前租户能用哪些模型"的接口；
`karda.ask` 等功能需要"业务自动适配"而不是每次都显式传 `modelCode`）已经实现，均是**加法式**
契约变更（不破坏任何现有调用方）：

### 7.1 租户过滤的可选模型清单

`GET /model-platform/models`（既有 `ModelRuntimeController` 路由，未新增前缀）新增
可选 query 参数 `tenantId`/`applicationId`/`applicationType`：

- 不带 `tenantId`：行为不变——返回全量启用模型（既有 ops/admin 用途）。
- 带 `tenantId`：改为返回该租户（+ 可选 application 范围）**实际持有有效 grant** 的模型集
  （`model.model_grants`，过滤 `isActive`/未过期/`model_grants.applicationId+Type` 精确匹配
  或租户级通配 grant），不是全局目录——这是 karda 做"用户主动选择模型"UI 的直接依赖。

### 7.2 任务画像路由（taskProfile）

`ChatRequest`/`EmbedRequest`/`RerankRequest`/`ParseRequest` 新增可选字段 `taskProfile: string`，
`modelCode` 相应改为可选——**二者至少给一个**，两者都不给会 400。调用方（如 `karda.ask`）可以只传
`taskProfile`（如 `"summarization"`），不需要预先知道具体 `modelCode`：

- `model.model_grants` 新增可空列 `task_profile`——运营在某个 grant 上打上 `taskProfile` 标签，
  即声明"这是该租户/应用在这个任务画像下的首选模型"；同一 taskProfile 可以有多条 grant，按
  `priority`（数值越小越优先）取最高优先级的有效（active、未过期）匹配。
- 精确 application 范围匹配优先于租户级通配 grant，和既有 `QuotaService.assertAllowed` 的
  entitlement 查找同一优先级规则,不是另一套语义。
- 解析找不到匹配时返回 `404 TASK_PROFILE_NOT_ROUTABLE`，不是静默兜底到某个默认模型。
- 管理面（`model-platform/admin/grants*`）的创建/更新 body 新增 `taskProfile` 字段，运营可以
  直接通过既有 grant CRUD 配置任务画像路由，不需要新的管理端点。

这两项都是纯加法（新 query 参数、新可选字段、新可空列），不改变任何现有调用方的行为——
per product_210 §11 自查：认证路径/错误封套/计量归属都复用既有 A1-A4 路径，未新增。
