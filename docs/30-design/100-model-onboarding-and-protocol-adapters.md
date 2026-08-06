# 100 - Model onboarding and protocol adapters

Adding a provider or a model is a **data** operation (admin page / admin API),
not a code change and a release.

Prerequisite: [ADR-004](decisions/ADR-004-reject-portkey-gateway-dependency.md)
(no Portkey dependency; borrow its declarative adapter structure, build it here).
Landing sequence: `docs/70-workplan/00-index.md`.

## 1. Scope

Not a goal: zero-code onboarding of *any* upstream. An upstream whose wire
format genuinely differs must get code. That is deliberate - pushing protocol
differences into configuration grows a DSL nobody can debug. The value is in
drawing the boundary, not erasing it.

Also not a goal: **Atlas meters, it does not bill** (owner decision
2026-08-01). Atlas records how many tokens a call burned and whose it was. Unit
prices are an operations concern living in `model_price_rules`. Nothing on the
request path computes money, and everything below discusses **quantities** only.

## 2. Three concepts one word conflates

`provider` carries three jobs today, which is the root of the tangle:

| Concept | Question | Home | Example |
|---|---|---|---|
| **Who** | which commercial entity | a `model_providers` row (data) | Volcengine, Zhipu, Anthropic, an internal vLLM |
| **How it speaks** | which wire format | `protocol` (closed vocabulary in code) | OpenAI Chat Completions, Anthropic Messages |
| **Quirks** | parameter differences within one wire format | `config.wire` jsonb (data) | endpoint suffix, auth header style, whether `stream_options` is needed |

Onboarding then touches only the first and third.

## 3. The criterion

> **Different wire format -> code. Same wire format, different
> parameters/endpoint/switches -> data.**

| Difference | Home | Reason |
|---|---|---|
| Endpoint suffix `/chat/completions` vs `/v1/chat` | data | same request body |
| Auth `Authorization: Bearer` vs `x-api-key` | data | same request body |
| Needs `stream_options.include_usage` | data | one extra switch |
| Supports tool calling / `top_p` | data | capability declaration, decides which fields are sent |
| `max_tokens` vs `max_completion_tokens` | data | a rename, not a shape change |
| Model id differs from `model_code` | data | already `config.upstreamModel` |
| Response is `choices[].message` vs `content[]` blocks | **code** | different response shape |
| Streaming is `delta` chunks vs `content_block_delta` events | **code** | different event model |
| Request is `messages[]` vs `contents[]` | **code** | different request shape |
| usage in a final frame vs spread across two event types | **code** | different aggregation |

## 4. The `protocol` vocabulary (closed, enumerated in code)

**Named after the wire format, not the vendor.** `protocol='doubao'` is wrong -
that is a vendor. `protocol='openai-chat-completions'` is a protocol.

| Value | Adapter | Covers |
|---|---|---|
| `openai-chat-completions` | generic OpenAI-dialect adapter | doubao, zhipu, deepseek, qwen, moonshot, siliconflow, vLLM, Ollama shim, any OpenAI-compatible gateway |
| `anthropic-messages` | Claude adapter | Anthropic and compatible proxies |

Reserved, unimplemented (code lands with the value):
`gemini-generate-content`, `bedrock-converse`.

Normalization accepts a few aliases (`openai` / `openai-compatible` fold into
`openai-chat-completions`) and is insensitive to case and hyphenation.

## 5. The quirk descriptor: `config.wire`

Both `model_providers.config` and `model.models.config` are existing jsonb
columns, so this layer costs **zero DDL**. A `wire` sub-object is agreed:

```jsonc
// model_providers.config - provider-level defaults
{
  "wire": {
    "schemaVersion": 1,
    "chatPath": "/chat/completions",
    "auth": { "style": "bearer" },          // bearer | x-api-key | header
    "streamUsage": "stream_options",        // stream_options | native | none
    "supports": { "tools": true, "toolChoice": true, "topP": true },
    "paramMap": { "maxTokens": "max_tokens" }   // only names that differ
  }
}

// model.models.config - model-level override, deep-merged over the provider's
{
  "upstreamModel": "doubao-seed-1-6-250615",
  "wire": { "supports": { "tools": false } }
}
```

Merge order: **adapter defaults <- provider `config.wire` <- model
`config.wire`**.

Two pre-existing config keys fold into this: `upstreamModel` stays top-level
(it is a model identifier, not a wire quirk); `anthropicVersion` moves into
`wire.headers["anthropic-version"]`, with the old key still read.

**`wire` is a closed schema, not a free dictionary.** Unknown keys are rejected
on write - otherwise this becomes a second dumping ground. Validation lives on
the `/capability/providers` and `/capability/models` write paths, not at
runtime.

**Strict on write, lenient at runtime.** Operators change configuration faster
than the service ships, so an older service reading a newer key must ignore it
and warn, never take a running model out of service. `wire.schemaVersion` is
the carrier of that rule: a required integer, currently `1`; an adapter reading
a higher version ignores what it does not recognize and logs a WARN.

## 6. Dispatch resolution

```
resolve(model: AiModelRecord): IModelProvider
  1. byProviderCode[model.provider]                  // special-case layer
  2. byProtocol[normalizeProtocol(model.protocol)]   // generic layer
  3. legacyProviderCodeMap[model.provider] + warn    // fallback, removed in P3
  4. throw MODEL_NOT_ROUTABLE
```

Layer 1 exists because `ZhipuProvider` implements `embed` and `rerank` (real
Zhipu Embedding-3 / rerank APIs), which are **not** part of the OpenAI Chat
Completions protocol. Its meaning is "this vendor supports capabilities beyond
the generic protocol", not "this vendor's chat is a bit different" - the latter
is what §5's `wire` is for.

`resolve()` takes the whole `AiModelRecord` rather than
`(providerName, modelCode)`, because dispatch now needs `protocol` and
`config`. The generic adapter has no class-level `providerName` constant - it
serves several vendors, so the provider code arrives on
`ProviderChatRequest.providerCode` and is used for error messages and metric
labels.

**Metric-label constraint**: `provider` is a registry-driven runtime value.
Provider codes come from the registry (a controlled set); `model_code` or any
caller-controlled string must never become a metric label. Re-evaluate the
cardinality question above roughly 100 registered providers.

## 7. Streaming usage

Most OpenAI-compatible upstreams return **no usage on streaming responses
unless explicitly opted in**, and usage is only recorded when the terminal
event carries it. Therefore `wire.streamUsage` has three values - request it
via `stream_options`, expect it natively, or accept that there is none and
estimate. This is the clearest case of a quirk belonging in data: three
upstream behaviours become three config values, not three `if` branches.

## 8. Admin surface required

Atlas has no `portals/`; the operator UI lives in `vxture-platform` and calls
Atlas over the network. This is therefore an **interface requirement** - the
pages are the platform line's work and need a liaison issue.

Already available: `/capability/providers`, `/capability/models`,
`/capability/grants`, `/capability/price-rules`, `/capability/provider-keys`.

Still needed:

| Endpoint | Purpose |
|---|---|
| `GET /capability/protocols` | dropdown source: the vocabulary plus each protocol's supported `wire` keys and defaults |
| `POST`/`PUT /capability/models` protocol validation | today a free string; must validate against the vocabulary |
| `config.wire` schema validation | reject unknown keys on write (§5) |
| `POST /capability/models/:id/probe` | connectivity self-check: one minimal non-streaming and one streaming call, reporting reachability and whether usage came back |

`probe` is what makes this design genuinely page-driven. Without it, a model
configured through a page is only proven correct by production traffic; with
it, a wrong `wire` is caught at save time.

**Probe usage is attributed to the platform, not to any tenant.** A probe
writes `reqlog.request_records` with `usage_type='test'` and the all-zero
`COMMERCE_SENTINEL_UUID` for `tenant_id`/`workspace_id`, and is excluded from
quota deduction and from C3 consume. It is Atlas's own operational act, so it
must not appear in any tenant's usage view.

## 9. Pricing is a manual onboarding step for half of Atlas's providers

Registering a model does not price it. A `model_price_rules` row is authored
separately through `/capability/price-rules`, and the field semantics that
govern it (unit basis, the USD-vs-CNY-default trap, the three vendor fields
Atlas has no column for) are in `docs/20-specs/10-http-surface.md`.

What onboarding needs to know is **where the number comes from**, because it
differs by provider. Public aggregate price tables cover the western vendors
well and the Chinese ones badly. Measured against LiteLLM's table, 2026-08-01:

| Atlas provider | Priced upstream |
|---|---|
| claude | 24/24 |
| moonshot | 22/22 |
| deepseek | 12/12 |
| xai | 40/40 |
| mistral | 54/58 |
| openai | 145/219 |
| qwen | 18/36 |
| **doubao** | **0/12** - rows exist, all prices absent |
| **private** | **0/29** - self-hosted, unpriced by definition |
| **zhipu** | **none** - no first-party rows at all |

So for **Doubao and Zhipu - two of the four providers Atlas runs today -
onboarding must read the price off the vendor's own console.** There is no
aggregate to copy from, and a partially-populated aggregate is the dangerous
case: it looks like coverage.

A zero price is never an acceptable placeholder. A rule charging nothing is
indistinguishable from a rule that works, and nothing on the request path
computes money (§1), so the error surfaces only when someone tries to bill.
Leave the model unpriced instead - an absent rule is a question, a zero rule is
a wrong answer.
