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
| **部署亲和（A2.3）** | **未决**——这是 karda `70` 号函的核心诉求，也是本文档唯一"需要 Atlas 资源/infra 决策而非纯设计"的一项。可行性取决于 Atlas 实际部署主机与 karda worker 是否同 tailnet 域/同机房，需在 Phase 6 host 分配拍板后才能给出结论。**在此之前不对 karda 承诺同域部署**，避免过早承诺又跳票——按 karda 要求"能力有无都要一个结论"，Phase 6 host 定了之后必须回一次 |
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

## 5. 待回karda的两件事（回函草稿见 `docs/80-liaison/`）

1. **G1（429 区分）**：本文档已给出确定设计，可以现在就回复 karda——不必等 Atlas 实现落地。
2. **A3.3（rerank 延迟）**：诚实告知"暂无法给数字，需实现+压测后才能承诺，会在 Atlas 有真实部署后第一时间测给",不假装现在已经知道。

## 6. 未决清单（不在本文档拍板,留给对应 Phase）

- A2.3 部署亲和：待 Phase 6 host 分配。
- A1 单批 chunk 数上限、A3 rerank 真实延迟：待 Phase 4/5 有真实模型+部署后压测。
- 各端点 `modelCode` 具体注册哪些型号（如 embedding 用什么模型、rerank 用什么 cross-encoder）：产品/成本决策，不在本设计文档范围。
