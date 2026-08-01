# Atlas HTTP surface

Authoritative map of every route Atlas serves, and the source of truth for
other products integrating against it. Link to this file from liaison issues
rather than pasting a copy.

There are no legacy aliases: every path below is the only path. Integration
notes referencing `model-platform/*` are stale - those paths 404.

Last verified against `service/src/**/*.controller.ts`: 2026-08-01.

## Data plane - S2S inference calls

Auth: `S2sAuthGuard` (RS256, `aud="atlas"`, `scope="tool:atlas"`, platform OIDC
issuer/JWKS).

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/chat` | Generation; `stream:true` for SSE |
| GET | `/v1/models` | `?tenantId=` filters to that tenant's granted models |
| POST | `/v1/embed` | A1 embedding - Zhipu only, other providers 501 |
| POST | `/v1/rerank` | A3 rerank - Zhipu only, other providers 501 |
| POST | `/v1/parse` | A2 parse - contract defined, no provider (TD-003/TD-019) |

`GET /v1/models?tenantId=` takes the tenant id as a caller-asserted parameter,
so any valid S2S token can enumerate any tenant's entitlements. `/tenancy/*`
supersedes it; retire it once callers move (`vxture-atlas`#66).

## Capability plane - operator/registry surface

Auth: `OperatorAuthGuard` - RS256, same issuer/JWKS as the S2S guard, requiring
`aud="atlas"` · `realm="workforce"` · `userType="operator"` ·
`scope="mgmt:atlas"`. Structurally disjoint from the data plane's `tool:atlas`:
an S2S token 401s here and an operator token 401s on `/v1` and `/tenancy`, by
design (product_250 §2). Do not point a service-identity caller at this plane.

The four provider-key mutation routes additionally require
`StepUpRequiredGuard`: the token's `amr` must contain a factor beyond `pwd`.
`rotate` derives `key_rotation_logs.rotated_by` from the verified operator's
`sub`, never from the request body.

| Method | Path | Notes |
|---|---|---|
| GET | `/capability/protocols` | Wire-protocol vocabulary + each protocol's `config.wire` defaults - the management UI's dropdown source. Static, no tenant data (`docs/30-design/100-model-onboarding-and-protocol-adapters.md` §5/§10) |
| GET/POST/PUT/DELETE | `/capability/providers[/:id[/activate\|deactivate]]` | Provider registry |
| GET/POST/PUT/DELETE | `/capability/models[/:id[/activate\|deactivate]]` | Model registry |
| GET/POST/PUT/DELETE | `/capability/grants[/:id[/activate]]` | Tenant/application grants, incl. `taskProfile` |
| GET/POST/PUT/DELETE | `/capability/price-rules[/:id[/activate\|deactivate]]` | Pricing |
| GET/POST/PUT | `/capability/policies[/:id[/activate\|deactivate]]` | Policy |
| GET | `/capability/quotas` | **501** - the platform exposes only a single-workspace C2 read, no bulk endpoint, so this cannot be answered honestly. Use `/tenancy/quotas` per workspace |
| GET | `/capability/usage-summaries` | Read-only |
| GET | `/capability/provider-keys` | Read-only, no step-up |
| POST/PUT | `/capability/provider-keys[/:id/rotate\|activate\|deactivate]` | Envelope-encrypted key vault - step-up required |

## Tenant self-service plane

Auth: `S2sAuthGuard` (`tool:atlas`). **Scope is derived from the token, never
from the caller**: `?scope=tenant` uses the `tenant_id` claim (falling back to
the legacy `org_id`), `?scope=workspace` (default) uses `workspace_id`. No
request field can widen it.

`?scope=tenant` is not universally available: the platform mints `org_id` only
when an organization is active, while every user has an auto-created `personal`
tenant, which therefore carries no tenancy claim and gets
`403 TENANCY_SCOPE_UNAVAILABLE`. `?scope=workspace` always works.

| Method | Path | Notes |
|---|---|---|
| GET | `/tenancy/models` | Models this workspace holds an active grant for |
| GET | `/tenancy/grants` | The grants themselves, incl. `taskProfile`/`priority`; operator-only `reason` is not projected |
| GET | `/tenancy/quotas` | Entitlement from the platform's C2 envelope |
| GET | `/tenancy/usage` | `?scope=workspace\|tenant`, `?days=1..366` (default 30) |

Together these are the full replacement set for what console-bff previously
read from `/capability/*`, which is what made locking that plane to operator
tokens possible.

Two levels because the platform's model has two: workspace is the
cost-accounting unit, tenant is the rollup above it. The namespace is named
after the tenancy *dimension* rather than either level.

`/tenancy/quotas` reads the C2 envelope, and `status` separates `covered` /
`uncovered` (resolved, no coverage) / `unavailable` (could not ask) - otherwise
"no plan published" and "platform unreachable" would render identically.

`/tenancy/usage` is served from Atlas's own `reqlog.request_records`
(`source: "atlas.reqlog"`) - what actually ran. It is **not** a billing figure;
billing sums the platform's `usage_events` over the subscription period. See
`docs/30-design/210-usage-metering-and-history.md`.

## Infra / health

| Method | Path | Notes |
|---|---|---|
| GET | `/healthz` | Liveness, zero dependencies |
| GET | `/readyz` | Readiness, checks dependencies incl. `reqlogPartitions` |
| GET | `/internal/diagnostics` | `InternalDiagnosticsGuard` |
| GET | `/status` | Human-readable render of `/readyz` |
| GET | `/metrics` | `InternalDiagnosticsGuard` |

`/healthz` and `/readyz` are unauthenticated; the other three are guarded.

## Protocol-fixed - not Atlas's naming to change unilaterally

| Method | Path | Notes |
|---|---|---|
| GET | `/.well-known/vxture-tools` | Capability discovery manifest (product_210 §11), `S2sAuthGuard`. `atlas.parse` is withheld until a provider exists (TD-019) |
| POST | `/provisioning/webhook` | C3 provisioning webhook, `x-vxture-signature` HMAC (not a guard) |

## Not implemented

OIDC RP (five endpoints) - an inherited services-profile obligation with no
controller in code. Atlas has no browser surface; the operator UI lives in
`vxture-platform`. Do not treat it as a live integration point.
