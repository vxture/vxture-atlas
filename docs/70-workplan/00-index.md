# 70-workplan - Build plan and batch tracker

Atlas's repo-split plan. Authority: `vxture-platform` repo, plan file
`atlas-repo-split` (owner-approved 2026-07-24) - the seven phases below mirror
it. This tracker is the atlas-repo-local view; the platform-repo side (BFF
routers, seed-catalog, docs updates, old-code removal) is tracked there.

## Phase 1 - repo scaffold (this scaffold)

| Item | Acceptance | State |
|------|-----------|-------|
| Governance base (root files, secret hygiene, SCA gate, docs skeleton, guardrails) | `check-docs-numbering.mjs --strict` exit 0; `gitleaks detect` 0 hits; osv scan clean | **done 2026-07-24** - real `pnpm-lock.yaml` generated, `--allow-no-lockfiles` removed |
| CI/CD workflows (`ci`/`build`/`deploy`/`db-init`/`rollback`/`secret-scan`/`codeql` + `tailnet-ssh-connect`) | workflows parse (`check-workflows.mjs --strict`); job names match the five required-check contexts | **done 2026-07-24** - all five required checks green on `main`; ruleset applied |
| `deploy/database/ddl/{00_baseline,97_service_role,98_column_locks}.sql` | `check-data-architecture.mjs --strict` (DDL <-> Prisma lockstep) once `service/prisma/schema.prisma` lands | **verified 2026-07-24** - lockstep guardrail passes (14 tables), AND actually applied against a real throwaway Postgres 18 container (not just name-matched): all three DDL files apply cleanly with zero errors; the generated Prisma client round-trips create/upsert/delete through `atlas_svc` (the least-privilege role, not superuser); column locks are enforced by Postgres itself, not just documented - confirmed `atlas_svc` can update whitelisted columns, is rejected updating identity columns (`workspace_id`) and the append-only `webhook_deliveries` table entirely |

## Phase 2 - data-layer migration (owner-gated live-DB work)

Migrate `model.*` (5 tables) out of the shared platform DB into this repo's
own physical database (`vxturestudio_modelruntime_main`), alongside the
already-designed `key`/`reqlog`/`routing` schemas. Replace the direct
cross-schema Prisma reads of `metering.quota_pools`/`usage_events`/
`usage_summary_months` with the standard C2/C3 network contract - this also
closes TD-002 (usage-metering no-op).

## Phase 3 - platform integration contract

OIDC RP five endpoints (present but inert - no browser surface today), C2
entitlement client, C3 provisioning webhook, C3 consume as the sole
inference-metering entry point, S2S provider surface (embedding/parse/rerank -
see TD-003 and the karda requirements letter) + S2S caller (upstream provider
adapters, carried over unchanged from the in-monorepo implementation).

**Blocked, confirmed 2026-07-24**: the C2/C3 half depends on the platform's
`tenant/application/agent` → `workspace/product/metric` scope-key
reconciliation (`data_model_200_schema.md` §2), which itself depends on the
platform's `product.agent_catalog` - not landed there yet. Not something
this repo can build around. **Interim fix landed instead**: removed the
ghost Prisma delegates that were crashing the request hot path (TD-005) and
replaced them with the platform's own documented fail-open doctrine
(`data_model_200_schema.md` §3) - see TD-002/TD-005 progress notes. This is
a stopgap, not Phase 3 completion; real C2/C3 wiring still needs to happen
once `product.agent_catalog` lands.

**S2S provider surface (embed/parse/rerank) - contract layer done 2026-07-24**:
see TD-003 progress note. Real provider integration for A1/A2/A3 still open
(product/cost decision) - `501 MODEL_NOT_IMPLEMENTED` stub, tracked as
`vxture-atlas`#37/#38/#39.

**A4 (chat) - real provider integration confirmed LIVE end to end
(2026-07-28)**: added a `ZhipuProvider` adapter (Zhipu/BigModel is
OpenAI-compatible, reuses `doubao.provider.ts`'s shared wire-format helpers)
and fixed several real bugs found via karda's first live integration test
against production (`vxture-atlas`#47 - see TD-010/TD-011/TD-012): a
non-UUID `tenantId` crashing as an unhandled 500, `model_grants.task_profile`
never actually reaching production (baseline-only, no incremental migration -
also exposed that `00_baseline.sql` wasn't idempotent, now fixed for all 14
tables), and `modelCode` being sent verbatim as the upstream `model` field
(breaks the platform's `{provider_code}/{vendor_model_name}` naming
convention for real calls - reported to `vxture-platform`#152, not resolved
project-wide, worked around here by registering bare model IDs). Three real
models now registered, granted, and generating for karda's test tenant:
`doubao-seed-2-0-lite-260428`, `doubao-seed-2-0-pro-260215`, `glm-5.2`.

**Platform governance update (2026-07-27)**: `product_210_tool-protocol.md`
bumped to v1.1, adding §11 - a 7-item self-check checklist L1 providers must
run through before shipping new/breaking S2S supply-side contract changes
(not a platform gate, self-checked in each provider's own design review).
Also adds a capability-discovery requirement (`GET /.well-known/vxture-tools`,
§4.2) Atlas doesn't implement yet - tracked as TD-008.

**C3 provisioning webhook - done 2026-07-24**: `POST /provisioning/webhook`
implemented per `docs/30-design/identity/080-rp-integration.md` §4/§5 (the
same wire contract already live in production for arda) - HMAC-SHA256
verification over the raw request body with dual-secret rotation support,
idempotent delivery handling, per-workspace monotonic `seq` ordering, and
record-only status persistence (`provisioning.workspace_provisionings` /
`provisioning.webhook_deliveries`, new schema in this repo's own DB - no
platform-side dependency). Deliberately does not create/tear down any
per-workspace schema, unlike an asset-face product - Atlas's data model is
global (model/grant/quota), not workspace-scoped, so there is nothing else to
provision on receipt of this event today.

**Provider-key vault (TD-006) - done 2026-07-26**: `service/src/provider-keys/`
adds envelope-encrypted provider-key storage (`key.provider_api_keys`, already
DDL/Prisma-defined but unwired until now) with an admin CRUD surface
(`model-platform/admin/provider-keys*`) - onboarding or rotating a provider
key is now a DB write, not a redeploy. The originally-planned Phase B
(external KMS/Vault for the master key) was evaluated and dropped - no such
infrastructure exists anywhere in the org; see TD-006 for the full note.

## Phase 4 - extraction mechanics

`git filter-repo`/`subtree split` of `services/model/platform` from
vxture-platform, preserving history, merged into `service/` here. Own
Dockerfile (not the shared `Dockerfile.nestjs-prisma`, which assumes a
monorepo build context).

**Done 2026-07-24** - history grafted (12 commits: scaffold + 8 real
extracted commits via one `-s ours` merge), pushed to `origin/main`.

## Phase 5 - consumer network + auth cutover

`vxture-platform`'s `bff/admin-bff`/`bff/console-bff` and
`agent-server/varda`'s `model-runtime-client` switch from local/unauthenticated
calls to Atlas's real network address with S2S auth (closes TD-004).

**Partially done 2026-07-24** - Atlas-side callee half only (`S2sAuthGuard`,
see TD-004 progress note). The platform-side token-exchange issuance and the
BFF/varda caller wiring live in `vxture-platform` and are explicitly out of
scope for this repo/pass - not started here.

## Phase 6 - platform-side registration

Deploy host assignment (TD-001, owner-gated), product catalog row completion,
webhook address, secret transport - see `docs/50-deployment/00-index.md`.

**Host allocation decided 2026-07-24** (owner-confirmed): worker-02
(`100.76.219.48`, business host, same as arda/varda/vxtpl), port **3100**
(fixed - inherited from the in-monorepo `model-platform` service, not a fresh
`32X0/32X1` pair; no beta port yet), `stack_root=/srv/md0/atlas`, tailnet
class 2. Reflected in `docs/50-deployment/00-index.md` and TD-001 here.
**Still open, blocking an actual deploy**: this repo's own docs are updated,
but `vxture-platform`'s `docs/50-deployment/13-infra-allocation-registry.md`
product-row (currently "待分配") still needs a matching update - out of
write-scope for this repo/session; real secrets (`DEPLOY_WORKER02_SSH_KEY`,
`DEPLOY_WORKER02_KNOWN_HOSTS`, ACR/tailscale credentials) and the GitHub
`production` Environment are not yet created.

**Done 2026-07-27**: all of the above landed - `production` GitHub
Environment created, `DEPLOY_WORKER02_*` secrets (org-level, shared across
10 repos deploying to worker-02), `ALIYUN_ACR_NAMESPACE`/`APP_PUBLISH_PORT`
set; `v0.1.0`/`v0.1.1`/`v0.1.2` deployed successfully end to end (build ->
ACR/GHCR push -> SSH deploy -> DDL apply -> health verify). Along the way,
found and fixed four real bugs that had never been exercised before (see
git history: Dockerfile `.npmrc` missing, Dockerfile secret-mount id
mismatch, `db-init.yml` DDL applied via a host path that doesn't exist
inside the container, `wget` missing from the runtime image for the
healthcheck). `vxture-platform`'s `13-infra-allocation-registry.md` atlas
row has been backfilled accordingly ("在产", worker-02:3100) - confirmed
directly in that file.

## Phase 7 - cutover and acceptance

Self-rectify runbook batches A-G all green; `product_200` section 7 six-item
e2e checklist (login -> provisioning -> gating -> consume -> invalidate
[skipped, atlas is not an asset-face product] -> full self-rectify one-shot);
real admin/console regression against the new network path; old
`services/model/platform` removed from vxture-platform only after the above.

**S2S consumer cutover (karda) - confirmed live 2026-07-28**: karda ran a
real end-to-end `karda.ask` integration test against production
(`vxture-atlas`#47, `vxture-karda`#76) - token-exchange mint -> RS256/JWKS
verify -> route -> grant check -> real upstream inference, all three
registered models returning real `201` generations. karda proceeding to its
own host cutover (`ATLAS_BASE_URL` + pinned model) to take `karda.ask` live.
This is the first real S2S consumer proving the full chain this repo's own
admin/console regression (above) hasn't exercised yet - still open for the
BFF/console side.
