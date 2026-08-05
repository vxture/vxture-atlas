# 70-workplan - Task checklist

What is done and what is left. Status only - no progress narrative; the
reasoning behind a design lives in `docs/30-design/`, the reasoning behind a
deferral in `docs/60-operations/10-tech-debt.md`.

The repo-split plan this tracker descends from is `atlas-repo-split` in
`vxture-platform` (owner-approved 2026-07-24). The platform-side half (BFF
routers, seed catalog, old-code removal) is tracked there, not here.

## Done

- [x] Governance base - root files, secret hygiene, SCA gate, docs skeleton,
      guardrails
- [x] CI/CD workflows and the five required checks (`quality-gate` / `build` /
      `test-coverage` / `audit` / `gitleaks`); `main` ruleset applied with
      `bypass_actors: []`
- [x] Source extracted from `vxture-platform` with history preserved
- [x] Own physical database `vx_atlas_postgres_db` - 14 tables,
      three-part DDL, column locks, DDL/Prisma lockstep guardrail
- [x] Deploy pipeline exercised end to end - worker-02:3100, ACR primary /
      GHCR fallback, `production` GitHub Environment, db-init, rollback
- [x] S2S callee surface - `S2sAuthGuard` (RS256/JWKS, product_210 §3.3)
- [x] Operator plane - `OperatorAuthGuard` + `StepUpRequiredGuard` on
      `/capability/*`
- [x] Tenant self-service plane `/tenancy/*` - scope derived from the token
- [x] C3 provisioning webhook - HMAC verify, dual-secret rotation, idempotent,
      per-workspace `seq` ordering
- [x] C2 entitlement client - the quota gate can deny (partial, see TD-016)
- [x] C3 consume caller + own `reqlog` request/error history, 6-month retention
      with partition maintenance and a `/readyz` runway alarm
- [x] Capability discovery `GET /.well-known/vxture-tools` incl. the §4.1a
      `endpoint` field
- [x] Provider-key vault - envelope-encrypted, add/rotate without a redeploy
- [x] A4 chat live in production - doubao / zhipu / claude / private adapters,
      streaming across all four
- [x] Tenant-filtered model list and `taskProfile` routing
- [x] Contract layer for A1 embed / A2 parse / A3 rerank; A1+A3 served by Zhipu
- [x] Model onboarding P0 - dispatch by `protocol`, not `provider_code`
- [x] Model onboarding P1 - `config.wire` descriptor, opt-in streaming usage

## To do

Model onboarding (`docs/30-design/100-model-onboarding-and-protocol-adapters.md`):

- [ ] P2 - `GET /capability/protocols`, `config.wire` schema validation on the
      write path, `POST /capability/models/:id/probe` self-check. This is what
      makes a provider onboarding purely a page operation.
- [ ] P3 - validate `protocol` against the closed vocabulary on write, then
      drop the `provider_code` fallback layer. **Normalize the existing rows
      first**: all 7 production models carry `protocol = 'openai'`, a legal
      alias today but not a vocabulary value, so tightening the write path
      without normalizing them rejects the next update of any of them. The
      normalization cannot go through `/capability/models` - `protocol` is
      deliberately outside `98_column_locks.sql`'s UPDATE whitelist (verified:
      the service role gets `42501 permission denied`), so it is a db-init
      change like any other structural one. Confirm the beta/local registries
      the same way before assuming the count is 7.

Provider surface (TD-003):

- [ ] A1 embedding provider beyond Zhipu (#37)
- [ ] A2 parse provider - the endpoint 501s today (#38, TD-019)
- [ ] A3 rerank provider beyond Zhipu (#39), then the P95 benchmark owed to
      karda (#36)

Gateway capabilities ([ADR-004](../30-design/decisions/ADR-004-reject-portkey-gateway-dependency.md)):

- [ ] Load balancing / fallback routing expressed as `model_policies` config
- [ ] Rate limiting (RPM/TPM/concurrency) - `RATE_LIMITED` is specified but
      unimplemented
- [ ] OpenAI-shaped entry (`/v1/chat/completions`) sharing one pipeline with
      `/v1/chat`; tenant identity from the token, never the body
- [ ] Cost calculation from `model_price_rules` (quantities only - Atlas
      meters, it does not bill)

Platform-side, not this repo's write-scope:

- [ ] Remaining S2S callers - admin-bff, varda (TD-004, #66)
- [ ] Provider-key and `taskProfile` operator UI (TD-007, TD-009, `platform`#148)
- [ ] Published `atlas` plan_version so the quota gate can deny uncovered
      workspaces (TD-016)

Housekeeping:

- [ ] Beta tier - needs a dedicated host (TD-001)
- [ ] Move `reqlog.ensure_partitions` / `drop_expired_partitions` onto the
      platform's `db-maintenance.yml`; the manual twice-yearly db-init cadence
      works and is alarmed, so this is convenience, not a blocker
- [ ] Own admin/console regression against the network path - karda has proven
      the S2S chain, the BFF/console side has not been re-run
