# ADR-002: ship the embed/parse/rerank contract layer, leave a 501 boundary

**Status**: Accepted
**Date**: 2026-07-24
**Related**: TD-003, TD-019, `docs/30-design/200-s2s-provider-surface.md`

## Context

Atlas served only generation (`ChatRequest`). karda had submitted field-level
requirements for embedding, parse and rerank (priority A1 > A3 > A2). Which
upstream model to buy for each is a product and cost decision, outside the
scope of an engineering batch.

## Options

**A. Contract layer and real provider calls together.** Picking a model just to
"deliver something complete" would likely be reversed later, and binds a
product decision to an engineering schedule.

**B. Contract layer only, 501 at the provider boundary.** `POST /v1/embed`,
`/v1/rerank` and `/v1/parse` land as real endpoints: request validation, model
resolution, grant and quota gating, provider routing - all identical to the
chat path. The only stub is `BaseProvider`'s default `embed`/`rerank`/
`parseDocument`, which throws `ProviderCapabilityNotImplementedError` and maps
to `501 MODEL_NOT_IMPLEMENTED`.

**C. Build nothing until the product decision lands.** The contract layer is
independent of model selection and valuable on its own; waiting buys nothing.

## Decision

Option B. Auth, validation, gating, routing and error codes are fully real;
provider integration is separate follow-on work gated on a product decision.
A 501 states honestly that no model is wired, rather than faking a response.

## Consequences

- Callers can develop against the real HTTP contract immediately.
- The parts that will not change with model selection are production-correct
  now.
- The three endpoints are unusable until a provider lands - an expected state,
  not a defect. Zhipu later covered A1 and A3; A2 is still 501 (TD-003).
- `RATE_LIMITED` (policy-driven throttling) and `RERANK_UNAVAILABLE` (fast-fail
  degradation) ship with the real provider - both need something real to
  throttle or degrade.
- Advertising a defined-but-unimplemented capability through capability
  discovery turned out to need its own answer; see TD-019.
