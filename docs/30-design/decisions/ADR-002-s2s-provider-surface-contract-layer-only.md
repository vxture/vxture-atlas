# ADR-002: S2S provider surface（embed/parse/rerank）先落契约层，真实 provider 调用留 501 边界

**状态**：✅ Accepted
**日期**：2026-07-24

---

## 背景

Atlas 当时只有 generation（`ChatRequest`）一个调用类型，karda 已经提交了
embedding/parse/rerank 三个能力的字段级需求（优先级 A1 embedding > A3 rerank
> A2 parsing），`docs/80-liaison/100-2607240931-karda-atlas-capability-requirements.md`
是权威原文。这三个能力需要落地，但具体接哪个上游模型/provider 是一个产品和
成本决策，不属于这一批工程实现的范围。

## 决策选项

### 选项 A：契约层和真实 provider 调用一起做

**缺点**：真实 provider 选型和成本核算尚未决定，为了"完整交付"而临时选一个
模型接入，后续大概率要推翻重接；把一个产品决策绑死在这一批工程排期上。

### 选项 B：只做契约层，真实调用留 501 边界

`POST /v1/embed`、`POST /v1/rerank`、`POST /v1/parse` 作为真实的、经过校验、
挂 `S2sAuthGuard` 的端点落地——请求校验、模型解析（`ModelRegistryService`）、
grant/quota gating（复用 chat 路径的 `QuotaService.assertAllowed`）、provider
路由（`ModelRouterService`）全部是真实逻辑，与 chat 路径完全一致。唯一的
stub 是 `BaseProvider` 的 `embed`/`rerank`/`parseDocument` 默认实现——抛
`ProviderCapabilityNotImplementedError`（沿用 `chatStream` 已有的默认拒绝
模式），映射成真实的 `501 MODEL_NOT_IMPLEMENTED`，而不是伪造一个假的成功
响应。

**优点**：契约层（鉴权、gating、错误码）是可以现在就做对、且不会因为选型
变化而返工的部分；501 边界诚实地反映"这里还没接真实模型"，调用方（karda）
能立刻针对真实的 HTTP 契约开发，不需要等模型选型落地。
**缺点**：功能上不可用，直到真实 provider 接入。

### 选项 C：完全不做，等产品决策定了再动工

**缺点**：契约层（鉴权、gating、限流边界如 A3.2 的候选池上限）本身有价值，
且不依赖模型选型，没有理由等待。

## 决策

采用**选项 B**。三个端点的契约层（鉴权、校验、gating、路由、错误码）全部
真实实现；`BaseProvider.embed/rerank/parseDocument` 默认抛
`ProviderCapabilityNotImplementedError`，映射为 `501 MODEL_NOT_IMPLEMENTED`。
真实 provider 接入作为独立的、待产品/成本决策后的后续工作，不在这一批范围内。

## 后果

**正面：**

- 鉴权、gating、错误码在真实模型接入之前就已经是生产可用的，不需要等待
  产品决策。
- 调用方能立刻针对真实契约开发/联调，不用等模型选型。
- A3.2（候选池上限 100）在服务端硬性拒绝而非静默截断，行为诚实。

**负面：**

- 三个端点在真实 provider 接入之前完全不可用（501），需要向调用方明确说明
  这是预期状态，不是缺陷。
- `RATE_LIMITED`（基于 `model_policies` 的真实限流）和
  `RERANK_UNAVAILABLE`（provider 不健康时的快速降级信号）暂未实现——两者
  都需要一个真实 provider 才有东西可限流/降级，随真实接入一起补齐。
- A3.3（rerank 延迟基准）、A2.3（parse 部署亲和性）仍然开放，需要真实压测
  和主机分配，不是这次决策能解决的。

---

_决策人：Atlas 团队（本次会话确认）| 实施于：`service/src/embedding/`、
`service/src/rerank/`、`service/src/parse/`、
`service/src/runtime/s2s-provider.shared.ts`、
`service/src/providers/base.provider.ts` | 关联：TD-003
（`docs/60-operations/10-tech-debt.md`）、
`docs/30-design/200-s2s-provider-surface.md`_
