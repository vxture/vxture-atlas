# 40-implementation - Module map and implementation status

Where each capability lives in `service/` and how complete it is. Route paths
are in `docs/20-specs/10-http-surface.md`; open gaps are in
`docs/60-operations/10-tech-debt.md`.

Atlas is a services-profile repo: one NestJS service under `service/`, root
module `AtlasModule`, workspace package `@atlas/service`. No `portals/`, no
browser surface.

## Dev setup

```bash
pnpm install
pnpm --filter @atlas/service db:generate   # Prisma client -> service/src/generated/
pnpm --filter @atlas/service dev
pnpm --filter @atlas/service test
pnpm type-check:all
```

## Module map

| Module | Holds | Status |
|---|---|---|
| `runtime/` | chat pipeline, health/readiness, metrics, `/status`, registry admin service, API-key resolution, the shared S2S provider helper | complete |
| `runtime/guards/` | `S2sAuthGuard` (data plane), `OperatorAuthGuard` + step-up (capability plane), `InternalDiagnosticsGuard` | complete |
| `registry/` | provider/model/grant/price-rule/policy reads, grant and task-profile resolution | complete |
| `router/` | dispatch to a provider adapter by `protocol`, with a special-case layer and a `provider_code` fallback | fallback layer still in place, see workplan P3 |
| `providers/` | `base`, `openai-compatible` (+ `wire`, `protocol`, `sse`), `doubao`, `zhipu`, `claude`, `private` | chat + streaming complete on all four; embed/rerank on Zhipu only; parse on none (TD-003) |
| `quota/` | entitlement gate ahead of every call | denies on exhausted pools; permissive for uncovered workspaces (TD-016) |
| `platform/` | C2 entitlement client | complete |
| `metering/` | C3 `POST /usage/consume` caller | complete |
| `reqlog/` | per-request and per-error history writes | complete; `product_id` and A1/A3 token counts stay NULL by design |
| `tenancy/` | `/tenancy/*` self-service reads, scope from the token | complete |
| `provider-keys/` | envelope-encrypted key vault + rotation log | complete |
| `provisioning/` | C3 webhook - signature, idempotency, ordering, persistence | complete |
| `discovery/` | `.well-known/vxture-tools` descriptors | complete; `atlas.parse` withheld (TD-019) |
| `embedding/`, `rerank/`, `parse/` | A1/A3/A2 contract layers | contract complete, provider coverage per TD-003 |

## Conventions

- Controllers validate and delegate; services hold the logic; repositories are
  the only Prisma callers.
- Caller-supplied identity is never trusted for attribution. `workspace_id`,
  `tenant_id` and `user_id` come from verified token claims (product_210
  rule 8), never from the request body.
- Logging never fails the request it describes - a `reqlog` write error is a
  warning, not a 500.
- A capability a provider does not implement throws
  `ProviderCapabilityNotImplementedError`, surfacing as
  `501 MODEL_NOT_IMPLEMENTED`. Never fake a success response.
- DB structure changes go through `deploy/database/ddl/` and db-init only. The
  DDL/Prisma lockstep guardrail runs in CI.
