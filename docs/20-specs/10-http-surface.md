# Atlas HTTP surface

Authoritative map of every route Atlas serves. Source of truth for other
products integrating against Atlas (platform, karda, varda, future L2/L3
callers) - link to this file from liaison issues rather than pasting a copy
of the table, so it can't go stale in two places.

Naming rationale (why `/v1`, why `/capability`, why the legacy aliases exist)
is recorded in `docs/60-operations/10-tech-debt.md` TD-013. This file is the
current-state table only; TD-013 is the "why".

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

**Legacy alias, do not build new integrations against it**: `POST
/model-platform/chat`, `GET /model-platform/models`. Kept only because
`vxture-platform`'s `model-runtime-client` (consumer: `agent-server/varda`)
still calls it. Tracked for removal at `vxture-atlas`#40 /
`vxture-platform`#144.

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

**Legacy alias, do not build new integrations against it**: `/model-platform/admin/*`,
`/model-platform/admin/provider-keys*`. Kept only because `admin-bff`
(`bff/admin-bff/src/routers/model-platform.router.ts`) still proxies here in
production. New callers (e.g. `capconsole-bff`) should target `/capability/*`
directly. Tracked at `vxture-platform`#144 / `#148`.

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
