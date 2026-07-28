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

Last verified against `service/src/**/*.controller.ts`: 2026-07-28.

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

Auth: currently `S2sAuthGuard`; migrating to operator-token verification
(`scope=mgmt:atlas`) under `vxture-atlas`#52 - do not assume S2S tokens work
here indefinitely.

| Method | Path | Notes |
|---|---|---|
| GET/POST/PUT/DELETE | `/capability/providers[/:id[/activate\|deactivate]]` | Provider registry |
| GET/POST/PUT/DELETE | `/capability/models[/:id[/activate\|deactivate]]` | Model registry |
| GET/POST/PUT/DELETE | `/capability/grants[/:id[/activate]]` | Tenant/application grants, incl. `taskProfile` |
| GET/POST/PUT/DELETE | `/capability/price-rules[/:id[/activate\|deactivate]]` | Pricing |
| GET/POST/PUT | `/capability/policies[/:id[/activate\|deactivate]]` | Policy |
| GET | `/capability/quotas`, `/capability/usage-summaries` | Read-only |
| GET/POST | `/capability/provider-keys[/:id/rotate\|activate\|deactivate]` | Provider API key vault (TD-006, envelope-encrypted) |

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
from the caller** - `?scope=tenant` uses the `org_id` claim, `?scope=workspace`
(default) uses `workspace_id`. There is no request field that can widen it.

| Method | Path | Notes |
|---|---|---|
| GET | `/tenancy/models` | Models this workspace holds an active grant for |
| GET | `/tenancy/usage` | `?scope=workspace\|tenant`, `?days=1..366` (default 30) |

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
