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
| `deploy/database/ddl/{00_baseline,97_service_role,98_column_locks}.sql` | `check-data-architecture.mjs --strict` (DDL <-> Prisma lockstep) once `service/prisma/schema.prisma` lands | DDL written; Prisma lockstep unverified until Phase 4 |

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
write-scope for this repo/session; real secrets (`DEPLOY_SSH_KEY`,
`DEPLOY_KNOWN_HOSTS`, ACR/tailscale credentials) and the GitHub
`production` Environment are not yet created.

## Phase 7 - cutover and acceptance

Self-rectify runbook batches A-G all green; `product_200` section 7 six-item
e2e checklist (login -> provisioning -> gating -> consume -> invalidate
[skipped, atlas is not an asset-face product] -> full self-rectify one-shot);
real admin/console regression against the new network path; old
`services/model/platform` removed from vxture-platform only after the above.
