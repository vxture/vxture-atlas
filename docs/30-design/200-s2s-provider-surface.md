# 200 - S2S provider surface (embedding / parse / rerank)

The endpoints Atlas exposes as a **supplier**: karda / arda / varda obtain a
credential by token exchange and call these. A4 (generation) is contracted in
the platform repo (`docs/30-design/platform/40-model-platform.md` §7,
`ChatRequest`) and is not restated here.

Contract layer implemented for all three; provider coverage is TD-003. Design
input was karda's field-level requirements
(`vxture-karda/docs/80-liaison/100-2607240931-karda-atlas-capability-requirements.md`).
Why the contract shipped ahead of the providers:
[ADR-002](decisions/ADR-002-s2s-provider-surface-contract-layer-only.md).

## 1. Semantics shared by all three

### 1.1 Rate limit and quota exhaustion are different answers

- **Rate limit** (a technical rate gate, from `model.model_policies`) ->
  HTTP `429`, body `{ "code": "RATE_LIMITED", "retryAfterMs": <int> }`, plus a
  standard `Retry-After` header. The caller should back off and retry.
- **Quota exhausted** (a commercial limit, from the platform's C2 envelope) ->
  HTTP `403`, body
  `{ "code": "QUOTA_EXHAUSTED", "resetAt": "<ISO8601|null>" }`. Not 429:
  retrying on a commercial limit only floods the caller's own pending queue.
  The caller should suspend the task and resume when quota returns.
- Both share the envelope `{ code, message, requestId }`. A given
  (`code`, HTTP status) pair is **never reused**, so callers branch on the pair
  and never parse message text.

### 1.2 Attribution and the single metering entry point

- Every A1-A4 request carries `workspaceId` (the owning or triggering
  workspace, per capability below), `tenantId` (rollup only) and
  `applicationId`/`applicationType` - the same field names A4 already uses, not
  a parallel vocabulary.
- Atlas is the **sole inference-metering entry point**: token and call
  consumption is accounted here and reported to the platform via C3 consume.
  Callers do not report model token usage themselves.
- Attribution is taken from verified token claims, never from the request body.

### 1.3 Credentials

- Background batch work (karda's processing pipeline: A1, A2) uses a
  service-mode token (product_210 token exchange), `aud=atlas`, `act.sub` =
  the calling service identity - not an end-user OBO token.
- Online retrieval (A3, user-triggered) may use either mode; metering records
  the workspace that issued the request.

## 2. A1 - Embedding

| Item | Contract |
|---|---|
| Endpoint | `POST /v1/embed` |
| Request | `{ modelCode, texts: string[], workspaceId, tenantId?, applicationId?, applicationType? }` |
| Response | `{ modelCode, modelVersion, dimension, vectors: number[][] }` - `vectors` matches `texts` in length and order |
| Version pinning | `modelCode` is itself the versioned identifier (e.g. `embed-bge-m3-v2`); no `latest` alias is exposed. `dimension` is immutable for a given `modelCode` - a new algorithm or dimension is registered as a **new** `modelCode`, and existing vector stores keep using the old one |
| Batching | one `texts` array per request; provisional ceiling 256, to be confirmed against a real model |
| Idempotency | no server-side cache; callers de-duplicate if they need to |

## 3. A2 - Parse (layout / OCR / table / formula)

| Item | Contract |
|---|---|
| Endpoint | `POST /v1/parse` |
| Request | `{ modelCode, task: "layout"\|"ocr"\|"table"\|"formula", pages: [{ pageIndex, imageRef\|imageBase64, regions?: [...] }], workspaceId, tenantId?, applicationId?, applicationType? }` |
| Response | shaped by `task`: `layout` -> `blocks: [{bbox, blockType}]`; `ocr` -> `spans: [{bbox, text}]`; `table` -> `{rows, cols, cells: [{rowSpan, colSpan, text, bbox}]}`; `formula` -> `{latex, bbox}` |
| Batching | one `pages` array carries multiple pages/regions - no per-page round trip |
| Deployment affinity | satisfied: Atlas and karda are both allocated to worker-02 on the same tailnet, so parse calls do not cross a public path. Re-confirm if either side moves host |
| Attribution | `workspaceId` = the library owner |

Returns 501 today - no provider implements it (TD-003, TD-019).

## 4. A3 - Rerank

| Item | Contract |
|---|---|
| Endpoint | `POST /v1/rerank` |
| Request | `{ modelCode, query: string, candidates: [{id, text}], workspaceId, tenantId?, applicationId?, applicationType? }` |
| Response | `{ modelCode, scores: [{id, score}] }` - scores are globally comparable within a `modelCode`, so no cross-index normalization is required of the caller |
| Candidate ceiling | hard server-side check `candidates.length <= 100`; over that is `400 CANDIDATE_POOL_TOO_LARGE`, never a silent truncation |
| Latency budget | no number is promised before a measured P95 on real hardware (`vxture-atlas`#36) |
| Degradation | when rerank is unavailable, fail fast with `503 RERANK_UNAVAILABLE` rather than hanging, so the caller can fall back to its own ordering and mark the result degraded |
| Attribution | `workspaceId` = the workspace that triggered the request, not the asset owner |

## 5. Tenant model list and task-profile routing

Two consumer-side prerequisites, both purely additive (new query parameters,
new optional fields, a new nullable column - no existing caller changes).

**Tenant-filtered model list.** `GET /v1/models` takes optional
`tenantId`/`applicationId`/`applicationType`. Without `tenantId` it returns all
enabled models (ops use). With it, it returns the models that tenant actually
holds a valid grant for - the direct dependency of a user-facing model picker.

`/tenancy/models` supersedes this for tenant-facing callers: it derives scope
from the token instead of accepting a caller-asserted `tenantId`.

**Task-profile routing.** All four request types take an optional
`taskProfile: string`, and `modelCode` becomes optional - **at least one of the
two is required**, neither is a 400. A caller can send only
`taskProfile: "summarization"` without knowing a `modelCode`.

- `model.model_grants.task_profile` (nullable) tags a grant as the preferred
  model for that tenant/application under that profile. Several grants may
  share a profile; the highest-priority active, unexpired match wins (lower
  `priority` number first).
- An exact application-scope match beats a tenant-wide wildcard grant - the
  same precedence the entitlement lookup already uses, not a second set of
  rules.
- No match is `404 TASK_PROFILE_NOT_ROUTABLE`, never a silent fallback to some
  default model.
- Operators configure it through the existing `/capability/grants` CRUD; no new
  admin endpoint.
