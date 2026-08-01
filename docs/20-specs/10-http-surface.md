# Atlas HTTP surface

Authoritative map of every route Atlas serves. Source of truth for other
products integrating against Atlas (platform, karda, varda, future L2/L3
callers) - link to this file from liaison issues rather than pasting a copy
of the table, so it can't go stale in two places.

Naming rationale is recorded in `docs/60-operations/10-tech-debt.md` TD-013.
This file is the current-state table only; TD-013 is the "why". As of
2026-07-28 there are no legacy aliases anywhere in this surface - every path
below is the only path. Older integration notes referencing
`model-platform/chat`, `model-platform/models`, or `model-platform/admin/*`
are stale; those paths return 404.

Last verified against `service/src/**/*.controller.ts`: 2026-08-01.

## Data plane - S2S inference calls

Auth: `S2sAuthGuard` (RS256, `aud="atlas"`, platform OIDC issuer/JWKS).

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/chat` | Generation; `stream:true` for SSE |
| GET | `/v1/models` | `?tenantId=` filters to that tenant's granted models |
| POST | `/v1/embed` | A1 embedding |
| POST | `/v1/rerank` | A3 rerank |
| POST | `/v1/parse` | A2 parse - contract defined, no real provider wired yet |

## Capability plane - operator/registry surface

Auth: `OperatorAuthGuard` (2026-07-29, #52, M-1) - RS256, same issuer/JWKS as
the S2S guard, but requires `aud="atlas"` · `realm="workforce"` ·
`userType="operator"` · `scope="mgmt:atlas"`. Structurally disjoint from the
S2S surface's `tool:atlas` - an S2S token 401s here and an operator token
401s on `/v1`/`/tenancy`, by design (`product_250_management-plane-contract.md`
§2). Console-bff's tenant reads moved to `/tenancy/*` first (#70) specifically
so this swap wouldn't break them - do not point a service-identity caller at
this plane.

The four provider-key mutation routes (create/rotate/activate/deactivate)
additionally require `StepUpRequiredGuard`: the token's `amr` claim must
contain a factor beyond `pwd` (M-1 item 2, step-up freshness). `rotate`
derives `key_rotation_logs.rotated_by` from the verified operator's `sub`,
never a request-body field (M-5 attribution).

| Method | Path | Notes |
|---|---|---|
| GET | `/capability/protocols` | Wire-protocol vocabulary + each protocol's `config.wire` defaults - the management UI's dropdown source. Static, no tenant data (`docs/30-design/100-model-onboarding-and-protocol-adapters.md` §5/§10) |
| GET/POST/PUT/DELETE | `/capability/providers[/:id[/activate\|deactivate]]` | Provider registry |
| GET/POST/PUT/DELETE | `/capability/models[/:id[/activate\|deactivate]]` | Model registry |
| POST | `/capability/models/:id/probe` | Connectivity self-check. **Makes a real upstream call** (capped at 16 output tokens, non-streaming + streaming). Reports reachability, the resolved adapter/protocol/`wire`, and **whether usage came back** - the signal that the model would otherwise go unmetered. Usage is attributed to the platform sentinel with `usage_type='test'`; no quota is consumed and nothing reaches the metering kernel |
| GET/POST/PUT/DELETE | `/capability/grants[/:id[/activate]]` | Tenant/application grants, incl. `taskProfile` |
| GET/POST/PUT/DELETE | `/capability/price-rules[/:id[/activate\|deactivate]]` | Pricing |
| GET/POST/PUT | `/capability/policies[/:id[/activate\|deactivate]]` | Policy |
| GET | `/capability/quotas` | **501** (TD-002/TD-005) - the platform exposes only a single-workspace C2 read, no bulk/list endpoint, so this cannot be answered honestly; use `/tenancy/quotas` per workspace instead |
| GET | `/capability/usage-summaries` | Read-only, currently always empty (no writer - see TD-005 progress note) |
| GET | `/capability/provider-keys` | No step-up required (read-only) |
| POST/PUT | `/capability/provider-keys[/:id/rotate\|activate\|deactivate]` | Provider API key vault (TD-006, envelope-encrypted) - step-up required |

## Infra / health - unauthenticated except where noted

| Method | Path | Notes |
|---|---|---|
| GET | `/healthz` | Liveness, zero dependencies |
| GET | `/readyz` | Readiness, checks dependencies |
| GET | `/internal/diagnostics` | `InternalDiagnosticsGuard` (loopback/header/token/IP-allowlist) |
| GET | `/status` | Human-readable HTML render of `/readyz` |
| GET | `/metrics` | `InternalDiagnosticsGuard` |

## Protocol-fixed - not Atlas's naming to change unilaterally

| Method | Path | Notes |
|---|---|---|
| GET | `/.well-known/vxture-tools` | Capability discovery manifest (product_210 §11), `S2sAuthGuard` |
| POST | `/provisioning/webhook` | C3 provisioning webhook, `x-vxture-signature` HMAC (not a guard) |

## Not yet implemented

OIDC RP (five endpoints, per `product_240_repo-template.md`'s inherited
services-profile obligation) - no controller exists in code yet. Do not
treat as a live integration point.

## Tenant self-service plane

Auth: `S2sAuthGuard` (`tool:atlas`). **Scope is derived from the token, never
from the caller** - `?scope=tenant` uses the `tenant_id` claim (falling back to
the legacy `org_id`), `?scope=workspace` (default) uses `workspace_id`. There
is no request field that can widen it.

**`?scope=tenant` is not universally available yet.** The platform mints
`org_id` only when an organization is active, while its data model gives every
user an auto-created `personal` tenant plus a default workspace - so personal
tenants carry no tenancy claim and get a `403 TENANCY_SCOPE_UNAVAILABLE`.
`?scope=workspace` always works. Tracked in `vxture-atlas`#71.

| Method | Path | Notes |
|---|---|---|
| GET | `/tenancy/models` | Models this workspace holds an active grant for |
| GET | `/tenancy/grants` | The grants themselves, incl. `taskProfile`/`priority`; operator-only `reason` is not projected |
| GET | `/tenancy/quotas` | Entitlement from the platform's C2 envelope |
| GET | `/tenancy/usage` | `?scope=workspace\|tenant`, `?days=1..366` (default 30) |

Together these are the full replacement set for what `console-bff` reads from
`/capability/*` today (models / grants / quotas / usage-summaries), which is
the precondition for locking the capability plane to operator tokens
(`vxture-atlas`#52).

`/tenancy/quotas` reads the **C2 envelope**, not Atlas's legacy
`tenant_subscription_quotas` mirror - the DB split left that a stub returning
`[]` (TD-005), which would render "no plan published" and "platform
unreachable" as the same empty page. `status` separates them: `covered` /
`uncovered` (resolved, no coverage - expected while atlas's plan catalog is an
unpublished draft) / `unavailable` (could not ask).

Two levels because the platform's model has two: workspace is the
cost-accounting unit, tenant (org) is the rollup above it, and a tenant
operator needs both views. The namespace is named after the tenancy
*dimension* rather than either level.

`/tenancy/usage` is served from Atlas's **own** `reqlog.request_records`
(`source: "atlas.reqlog"`), i.e. what actually ran. It is **not** a billing
figure - billing sums the platform's `usage_events` over the subscription
period. See `docs/30-design/210-usage-metering-and-history.md`.

This supersedes `/v1/models?tenantId=`, which took the tenant id as a
caller-asserted query param and therefore let any valid S2S token enumerate
any tenant's entitlements. That endpoint still exists for karda; it should be
retired once callers move (see `vxture-atlas`#52 / #66).
