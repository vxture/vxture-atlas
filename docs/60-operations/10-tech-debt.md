# Tech-debt register (TD-NNN)

Append-only. Each entry is a known, deliberately-deferred debt with a stable ID
(never reused). Path pinned by the org taxonomy section 4.

Per the platform's deviation discipline (`140-repo-governance-standard.md`,
execution model): a standard clause that cannot yet be met because an upstream
dependency is not ready must be (1) annotated at the implementation site, (2)
registered here by name (clause / reason / recovery condition), and (3)
reported to the platform line. Silent deviation fails self-rectify acceptance.

These four entries are known at extraction time (2026-07-24), inherited from
the in-monorepo `@vxture/service-model-platform` implementation and the
repo-split plan itself - not discovered later.

| ID | Title | Opened | Status |
|----|-------|--------|--------|
| TD-001 | Deploy host unassigned; beta tier dormant | 2026-07-24 | partially closed 2026-07-24 - host owner-confirmed (worker-02); real deploys succeeded 2026-07-27, platform infra-allocation-registry backfilled; beta tier still dormant |
| TD-002 | Usage-metering write path is a no-op, inherited from the in-monorepo implementation | 2026-07-24 | open - blocked on platform `product.agent_catalog` (see TD-005 progress note), not just C3 consume wiring |
| TD-003 | S2S provider surface (embedding/parse/rerank) not designed; karda has submitted field-level requirements as design input | 2026-07-24 | contract layer landed 2026-07-24 (`POST /v1/embed`\|`/v1/rerank`\|`/v1/parse`, S2sAuthGuard, model/quota gating, G1 error envelope); real provider integration still open (product/cost decision) - A2.3 (parse deployment affinity) resolved 2026-07-27 (same host, worker-02, see progress note); A3.3 (rerank latency) still needs real benchmarking - blocked on a real provider, not actionable yet; new platform governance checklist (product_210 §11) to self-check future changes against, see progress note |
| TD-004 | BFF-to-service auth is currently unauthenticated (plain fetch, diagnostics-only guard) | 2026-07-24 | partially closed 2026-07-24 - Atlas-side S2S token verification (callee half) landed; platform-side token-exchange issuance + BFF/varda client wiring (caller half) still open |
| TD-005 | `quota.service.ts`/`metering.service.ts`/`model-registry.repository.ts` reference Prisma models removed from `prisma/schema.prisma` during the physical DB split | 2026-07-24 | crash risk closed 2026-07-24 (ghost delegates removed, fail-open in place); real C2/C3 wiring still blocked on platform `product.agent_catalog` |
| TD-006 | Provider API keys resolved only via `apiKeyEnvVar` (env var) - onboarding or rotating a provider key requires a redeploy | 2026-07-26 | closed 2026-07-26 (envelope-encrypted provider-key vault, `key.provider_api_keys`, no redeploy for add/rotate); the originally-planned Phase B (external KMS/Vault for the master key) was evaluated and dropped - no org-wide KMS/Vault exists anywhere today, see progress note |
| TD-007 | Provider-key vault (`model-platform/admin/provider-keys*`) has no admin/console UI or BFF coverage in vxture-platform, unlike every other model-platform resource | 2026-07-26 | open - not this repo's write-scope; handoff letter sent, see progress note |
| TD-008 | Atlas has no `GET /.well-known/vxture-tools` capability-discovery endpoint, now required by product_210 §11 item 6 for any L1 provider shipping tool descriptors | 2026-07-27 | closed 2026-07-27 - `GET /.well-known/vxture-tools` implemented (`service/src/discovery/`), `S2sAuthGuard`-protected, registers all four `atlas.*` descriptors at `version: "1.0.0"` |
| TD-009 | `ModelGrantsPage.tsx` (vxture-platform admin portal) has no `taskProfile` form field - operators can only configure task-profile routing (TD-003b) via raw API call, not through the Admin UI | 2026-07-27 | open - not this repo's write-scope; same pattern as TD-007 (backend shipped, platform UI not updated); reported alongside TD-007 in `vxture-platform`#148 (marked discussion/decision, also raises the broader architecture question of Atlas's admin surface living entirely in a different repo) |
| TD-010 | A non-UUID `tenantId`/`applicationId` reaching `model.model_grants` (a `uuid` column) crashed as an unhandled Prisma error - opaque `500`, found live via karda's first real end-to-end probe (`vxture-atlas`#47) | 2026-07-27 | closed 2026-07-27 - `ModelRegistryRepository.findBestGrant`/`findModelCodeForTaskProfile`/`listGrantedModels` now validate UUID format before querying, throwing a clean `400 INVALID_TENANT_ID`/`INVALID_APPLICATION_ID` instead; reproduced and verified against a real local Postgres before/after the fix |
| TD-011 | TD-003b's `model_grants.task_profile` column shipped only in `00_baseline.sql` (create-once, no-op against an already-provisioned table) with no incremental migration - production never actually got the column, so every grant/taskProfile query 500'd for real (karda re-test, `vxture-atlas`#47) even after TD-010's fix | 2026-07-28 | closed 2026-07-28 - added `deploy/database/ddl/incr/01_model_grants_task_profile.sql`; also discovered and fixed `00_baseline.sql` was missing `IF NOT EXISTS` on every `CREATE TABLE`/`CREATE INDEX` (contradicting its own db-init.yml's documented "every statement is IF NOT EXISTS" assumption) - re-running `db-init apply` against an already-initialized database would have failed at the first statement, before ever reaching `incr/`; fixed all 14 tables + all indexes. Verified against a real local Postgres: reproduced the exact production state (old baseline, no column), applied the fixed baseline+97+98+incr sequence twice in a row, both clean |

## TD-001 - deploy host unassigned; beta tier dormant

- **Clause not yet met**: `140-repo-governance-standard.md` section 4 - product
  repos run two tag->env tiers, `beta-*` -> beta and `v*.*.*` -> production.
- **Reason**: no host has been assigned to Atlas yet
  (`vxture-platform/docs/50-deployment/13-infra-allocation-registry.md`
  section 3, atlas row - host/port/stack_root all TBD). Until a host exists,
  `deploy.yml`/`db-init.yml`/`rollback.yml` are authored but cannot be
  exercised, and the beta tier stays out entirely (a tag prefix with no
  environment behind it deploys nothing and fails confusingly).
- **Annotated at**: `.github/workflows/deploy.yml` header comment,
  `docs/50-deployment/00-index.md`.
- **Recovery condition**: owner assigns a deploy host (worker + stack_root +
  tailnet class); wire the `production` GitHub Environment with real
  `DEPLOY_*` secrets; first `v*.*.*` deploy succeeds. Add the beta tier only
  once a dedicated beta server exists.
- **Report to platform line**: this is the single open item the repo-split
  plan explicitly flags as requiring owner decision, not agent action.
- **Progress (2026-07-24)**: owner confirmed the host assignment - worker-02
  (`100.76.219.48`), port 3100 (fixed, inherited from the in-monorepo
  service - not a fresh app-profile port pair), `stack_root=/srv/md0/atlas`,
  tailnet class 2. Reflected in `docs/50-deployment/00-index.md`. **Still
  open**: mirroring this into vxture-platform's own
  `docs/50-deployment/13-infra-allocation-registry.md` product row (a
  different repo, out of this session's write-scope); real `DEPLOY_*`/ACR/
  tailscale secrets; the `production` GitHub Environment itself; the beta
  tier (still dormant, no dedicated beta host).
- **Progress (2026-07-27)**: real `v0.1.0`/`v0.1.1`/`v0.1.2` deploys to
  worker-02:3100 succeeded end to end (build -> ACR/GHCR push -> SSH deploy ->
  DDL apply -> health verify), closing the "cannot be exercised" half of this
  entry. `vxture-platform`'s `13-infra-allocation-registry.md` atlas row has
  now been backfilled to reflect this ("在产" / worker-02:3100, 2026-07-27) -
  verified directly in that file. Still open: beta tier (no dedicated beta
  host).

## TD-002 - usage-metering write path is a no-op

- **What is deferred**: the in-monorepo implementation's `recordUsage`/
  `upsertUsageSummary` (`model-registry.repository.ts`) is a hard no-op today -
  it cannot satisfy the real cross-schema FKs to the platform's
  `tenancy.workspaces`/`product.products` (an 18-schema cutover renamed
  `commerce` -> `metering` with a workspace/product/metric-key model the
  service was never updated for).
- **Why it is debt, not just a schedule**: every successful model call
  currently silently fails to record usage. This has been running in
  production this way.
- **Recovery condition**: Phase 2/3 of the repo-split plan replace the direct
  cross-schema Prisma read/write entirely with the standard C2 entitlement
  read + C3 consume buffer/flush network contract - this closes the no-op as
  a side effect of the split, not a separate fix.
- **Report to platform line**: carried in the repo-split plan itself
  (`vxture-platform`, Phase 2 item 3).
- **Progress (2026-07-24)**: confirmed this is genuinely blocked, not just
  unscheduled - `vxture-platform`'s `docs/30-design/data_model_200_schema.md`
  §2 states the `tenant/application/agent` → `workspace/product/metric`
  scope-key reconciliation (required before `POST /usage/consume` can be
  called at all) itself depends on the platform's `product.agent_catalog`
  (application/agent → product mapping), which has **not landed** on the
  platform side ("产品域规划态，本轮未落"). Per that same doc's §3
  ("同步 + 有界本地 fail-open + 异步对账"), the platform's own documented
  doctrine for this exact situation is bounded fail-open, not blocking - see
  TD-005's progress note for what changed here as a result.

## TD-003 - S2S provider surface not designed

- **What is missing**: Atlas has no embedding, parse (layout/OCR/table/
  formula), or rerank endpoint today - only generation (`ChatRequest`) is
  implemented. karda has already submitted field-level requirements as design
  input (priority order A1 embedding > A3 rerank > A2 parsing; hard
  constraints: batch API, pinned+enumerable model version for embedding,
  stable vector dimension, service-mode workspace-scoped metering, 429 that
  distinguishes rate-limit from quota-exhaustion, rerank P95 <400ms at 100
  candidates or an early "not feasible" signal, fast-fail degradation signal
  for rerank).
- **Where the requirements live**: `vxture-karda` repo,
  `docs/80-liaison/100-2607240931-karda-atlas-capability-requirements.md` (the
  master copy - per the org liaison convention, inbound letters are not copied
  wholesale into the receiving repo; see `docs/80-liaison/00-index.md` here
  for the receipt record).
- **Recovery condition**: Phase 3 of the repo-split plan designs and
  implements the four call types; karda's priority order (A1 > A3 > A2)
  should drive build sequencing.
- **Progress**: v0.1 design drafted at `docs/30-design/200-s2s-provider-surface.md`,
  covering endpoint shapes for all three plus the shared G1-G4 semantics. G1
  (429 rate-limit vs quota-exhaustion) is decided and answered back to karda
  in a drafted (unsent) reply, `docs/80-liaison/10-2607241030-atlas-reply-to-karda-capability-requirements.md`.
  A3.3 (rerank latency) and A2.3 (parse deployment affinity) remain genuinely
  open - they need a real benchmark and a host assignment respectively, not a
  design decision, and the draft reply says so honestly instead of guessing.
- **Progress (2026-07-24) - contract layer implemented**: `POST /v1/embed`
  (`service/src/embedding/`), `POST /v1/rerank` (`service/src/rerank/`), and
  `POST /v1/parse` (`service/src/parse/`) are real, guarded (`S2sAuthGuard`),
  request-validated endpoints that resolve the model via
  `ModelRegistryService`, gate through `QuotaService.assertAllowed` (grant +
  fail-open quota, same path chat uses), and route to a provider via
  `ModelRouterService` - exactly like the chat path. A3.2's candidate-pool
  limit (100) is enforced server-side, rejecting with `CANDIDATE_POOL_TOO_LARGE`
  rather than silently truncating. The G1 error envelope
  (`ModelRuntimeException`/`ModelRuntimeErrorResponse`) gained the new codes
  this surface needs (`QUOTA_EXHAUSTED`, `RATE_LIMITED`,
  `CANDIDATE_POOL_TOO_LARGE`, `RERANK_UNAVAILABLE`, `MODEL_NOT_IMPLEMENTED`).
  **What's still a stub, deliberately**: no provider implements the actual
  `embed`/`rerank`/`parseDocument` upstream call - `BaseProvider` gives each a
  default throw (`ProviderCapabilityNotImplementedError`, same pattern as
  `chatStream`'s existing default), which these endpoints map to a real `501
  MODEL_NOT_IMPLEMENTED` response. Which provider/model backs each capability
  is a product/cost decision, explicitly out of scope for this pass (per this
  doc's own framing - see `docs/30-design/200-s2s-provider-surface.md`).
  `RATE_LIMITED` (real rate-limiting against `model_policies`) and
  `RERANK_UNAVAILABLE`'s fast-fail-on-unhealthy-provider signal are not
  implemented either - both need a real provider integration to have
  anything to rate-limit or degrade, so they follow once a provider is chosen.
- **Progress (2026-07-27) - new governance checklist to self-check against**:
  `vxture-platform`'s `docs/30-design/product_210_tool-protocol.md` bumped to
  v1.1, adding §11 "供给面契约变更检查单" - a mandatory 7-item self-check
  (auth path / error semantics / metering attribution / workspace-attribution
  principle / known-consumer broadcast / capability-discovery registration /
  cross-repo fact backfill) that Atlas (as an L1 provider) must run through
  before shipping any new or breaking S2S supply-side contract change. Not a
  platform-gated approval - self-checked in Atlas's own design review, per
  the "platform issues standards, not gateways" rule
  (`docs/30-design/platform/41-atlas-integration-topology.md` §7.1). Item 6
  (capability discovery via `GET /.well-known/vxture-tools`, product_210
  §4.2) is not implemented in Atlas today - tracked as TD-008.
- **Progress (2026-07-27) - A2.3 resolved**: `vxture-platform`'s
  `docs/50-deployment/13-infra-allocation-registry.md` confirms both the
  atlas row and the karda(L2) row are `worker-02` (`100.76.219.48`, tailnet
  class 2) - same physical host, same tailnet domain. Deployment affinity for
  A2 parse calls is therefore satisfied (no cross-host hop); reflected in
  `docs/30-design/200-s2s-provider-surface.md` §A2.3 and folded into the
  karda reply letter (`docs/80-liaison/10-2607241030-...`). This is a
  point-in-time fact tied to the current host assignment, not a permanent
  guarantee - it needs re-confirming if either side's host ever changes.
- **Progress (2026-07-27) - `aud=atlas` production registration confirmed**:
  the one residual item flagged in the karda reply (whether Atlas's
  `product.products` row + OIDC client `product_id` backfill had actually run
  in production, not just merged in code) is now confirmed done - platform
  line verified in `vxture-platform`#145 that two `db-init` seed runs
  (2026-07-26T19:12Z, 2026-07-27T03:41Z) both completed the atlas OIDC
  client + `product_id` backfill + plan-skeleton steps successfully. (Those
  runs show CI "failure" on an unrelated later read-only check - a
  pre-existing `[B0]` DDL stamp drift on the platform side, does not roll
  back the seed and is not Atlas's concern.) karda is clear to run its
  end-to-end `karda.ask <-> A4` check against a real `aud=atlas` token.
  Reported back in `vxture-karda`#70. **`[B0]` itself - resolved
  (2026-07-27)**: the platform-side DDL stamp restamp actually landed (SSH +
  psql), confirmed by a dedicated `db-init` verify run showing all of
  A/B/C/C2 passing ("baseline audit OK - schema set exact (19 targets),
  table count == DDL (114), seed catalog floors met, super_admin full-grant
  (54/54)"). Platform posted the closing evidence as a follow-up on
  `vxture-platform`#145 - it doesn't change the atlas-registration
  confirmation already given above, just closes the one loose end. Still not
  an Atlas TD entry (platform's own DDL stamp-table bookkeeping, zero overlap
  with this repo's DDL) - kept here only as the closing note to the mention
  above, not a design change to the stamp mechanism itself
  (`data_platform_320_target-cutover.md` documents that generically; this was
  a one-off drift incident on the platform side, not a mechanism change).

## TD-003a - URL path asymmetry (`/model-platform/chat` vs `/v1/*`) is intentional, not debt

- **What was checked (2026-07-27)**: A1/A2/A3 (`/v1/embed`, `/v1/rerank`,
  `/v1/parse`) and the new discovery endpoint (TD-008) all live under `/v1/*`,
  while A4 generation still answers at `/model-platform/chat` (and
  `/model-platform/models`) - a naming asymmetry that looked like cheap,
  free-standing cleanup.
- **Why it was NOT changed**: `vxture-platform`'s
  `packages/ai/model-runtime-client/src/llm/client.ts` (the shared client
  library every consumer, including varda in production, uses to call Atlas)
  hardcodes the literal path `/model-platform/chat` for both the non-streaming
  and streaming call sites. This is a live, already-integrated contract, not
  an unused legacy path waiting for a cheap rename window - renaming it here
  would break every existing caller of that shared package with no
  coordinated migration on the platform side.
- **Conclusion**: leave `/model-platform/chat`/`/model-platform/models` as-is.
  If unifying the surface is ever wanted, it needs to be a coordinated,
  additive migration (new `/v1/chat` route added alongside the old one, old
  one deprecated on a real timeline, `model-runtime-client` updated and
  released, consumers migrated) - not a unilateral rename in this repo. Not
  opening a tracked TD entry for this since it is a deliberate decision, not a
  deferred fix.
- **Tracked**: `vxture-atlas`#40 (kept open, blocked) and
  `vxture-platform`#144 (liaison, opened 2026-07-27 to get the coordinated
  `model-runtime-client` update tracked before this is revisited).

## TD-003b - tenant-filtered model list + task-profile routing (2026-07-27, deployed and confirmed live)

- **What was missing**: `GET /model-platform/models` returned the full
  unfiltered model catalog regardless of caller - karda's user-facing model
  selector needs "what can this tenant actually call," not the global list.
  Separately, every A1-A4 call required an explicit `modelCode` - karda's
  "automatic adaptation" features (e.g. `karda.ask`) wanted to express intent
  (a task profile) instead of hardcoding a specific model.
- **Landed (2026-07-27)**: both additive, non-breaking:
  - `GET /model-platform/models?tenantId=...&applicationId=...&applicationType=...`
    - omitting `tenantId` keeps the old unfiltered behavior; passing it
      returns only models with an active, non-expired `model_grants` match
      (`ModelRegistryService.listModelsForTenant`,
      `ModelRegistryRepository.listGrantedModels`).
  - `taskProfile` (optional) added to `ChatRequest`/`EmbedRequest`/
    `RerankRequest`/`ParseRequest`; `modelCode` correspondingly made optional
    - at least one of the two is required (400 otherwise). Resolution via a
    new nullable `model.model_grants.task_profile` column (DDL +
    Prisma in lockstep) and `ModelRegistryService.resolveModelCodeForTaskProfile`
    /`ModelRegistryRepository.findModelCodeForTaskProfile`, wired into the A4
    chat/stream path (`runtime.service.ts`) and the shared A1-A3 gate
    (`s2s-provider.shared.ts`'s `resolveGatedModel`) so all four endpoints
    share one resolution path. No match -> `404 TASK_PROFILE_NOT_ROUTABLE`,
    never a silent default. Admin grant CRUD
    (`model-platform/admin/grants*`) gained a `taskProfile` field so operators
    configure this through the existing grant API, no new admin endpoint.
  - Design: `docs/30-design/200-s2s-provider-surface.md` §7. Full test suite
    green (256/256), `tsc --noEmit` clean.
- **Report to karda line**: recorded in the karda reply letter
  (`docs/80-liaison/10-2607241030-...`) as capabilities now available, since
  these were karda's own asks (model selector prerequisite, `karda.ask`
  auto-adaptation).
- **Correction (2026-07-27, flagged by karda in `vxture-karda`#72)**: the
  karda reply letter's §6 said these were "already shipped" - at the time of
  writing that was premature (the work existed only as local, uncommitted
  changes in that session). Merged into `main` since via PR #44 (squash
  commit `6ea81ac`), which is real and confirmed. **But merged-to-main is
  not the same as deployed** - this repo's deploy model is tag-triggered,
  not merge-triggered, and the running production instance
  (`worker-02:3100`) is still on `v0.1.2`, which predates this work. Told
  karda directly (`vxture-karda`#72) to hold off flipping
  `ATLAS_ASK_TASK_PROFILE` against production traffic until a new version
  tag actually ships. **Recovery condition**: cut and deploy a `v0.1.3`\+
  tag, then confirm back to karda that the capability is live, not just
  merged.
- **Deployed (2026-07-27)**: `v0.1.3` tagged and deployed to production
  (`worker-02:3100`), reviewer-approved through the `production` GitHub
  Environment gate. Health verify passed (`verify OK (health 200)`) at
  2026-07-27T11:52 UTC; `VERSION` on the host is `8bd52b3`. Confirmed back to
  karda in `vxture-karda`#72 - cleared to use `ATLAS_ASK_TASK_PROFILE`
  against production traffic now.

## TD-004 - BFF-to-service auth is unauthenticated

- **What is missing**: `bff/admin-bff` and `bff/console-bff` (in
  vxture-platform) call the in-monorepo service over plain `fetch` with no
  token - only a diagnostics-only guard exists
  (`InternalDiagnosticsGuard`), not wired to the general admin/model CRUD
  routes.
- **Why it is fine today but not after the split**: same-host/same-network
  calls within a trusted monorepo deployment are a much smaller exposure than
  a genuinely separate repo/service reachable over the network.
- **Recovery condition**: Phase 5 of the repo-split plan wires real S2S
  auth (product_210 token exchange, since Atlas has no legacy
  `AUTH_INTERNAL_TOKEN` history to be backward-compatible with) before the
  BFFs are pointed at Atlas's real network address.
- **Progress (2026-07-24)**: the Atlas-side callee half is implemented -
  `S2sAuthGuard` (`service/src/runtime/guards/s2s-auth.guard.ts`) verifies the
  RS256 S2S token per product_210 §3.3's eight rules (RS256-only, `kid`-based
  JWKS lookup via `jose`'s cached remote JWKS set, exact `iss` match, `aud`
  match against `S2S_AUDIENCE`, `exp` with 60s skew, required `act.sub`; rules
  7/8 hold by construction - the guard never reads `x-vxture-internal-auth`
  and only derives org/workspace context from verified claims, never from
  headers/body). Applied to `ModelRuntimeController` and
  `ModelAdminController` (the two route groups this entry names as
  unguarded). **Still open**: the platform-side token-exchange endpoint
  issuing these tokens and the `bff/admin-bff`/`bff/console-bff`/
  `agent-server/varda` callers that must send them - that half lives in
  `vxture-platform`, out of scope for this pass.

## TD-005 - service code references Prisma models removed by the DB split

- **What happened**: the physical-DB migration (this repo-split's Phase 2)
  removed the `metering` schema and its three proxy models
  (`TenantSubscriptionQuota`/`TenantUsageEvent`/`TenantUsageSummary`) from
  `service/prisma/schema.prisma` - that schema belongs to the platform DB,
  which Atlas no longer connects to directly (zero cross-database FK,
  boundary #1).
- **What breaks**: `service/src/quota/quota.service.ts`,
  `service/src/metering/metering.service.ts`, and
  `service/src/registry/model-registry.repository.ts` still call
  `prisma.tenantSubscriptionQuota`/`tenantUsageEvent`/`tenantUsageSummary`.
  **Correction (2026-07-24)**: this no longer fails `type-check`/`build` - a
  later commit added a hand-authored `ModelPlatformPrismaClient` interface
  (`service/src/prisma.ts`) declaring these three delegates and type-asserts
  the real generated `PrismaClient` onto it (`as unknown as
  ModelPlatformPrismaClient`). The cast satisfies the compiler but the
  generated client has no such properties (`service/prisma/schema.prisma`
  only defines `ModelProvider`/`ModelDefinition`/`ModelGrant`/etc.) - calling
  these three delegates still throws at runtime (`Cannot read properties of
  undefined`). CI is green because nothing exercises that code path yet
  (no test calls these three methods); the compile-time symptom described
  above is gone, the underlying gap is not.
- **Why this was left broken on purpose**: the correct fix is replacing these
  direct Prisma calls with the C2 entitlement client and C3 consume
  buffer/flush client (design in
  `docs/30-design/200-s2s-provider-surface.md` section 1.2) - that is
  business-logic implementation, explicitly out of scope for this migration
  pass. Leaving the schema half-connected to the platform DB (i.e. not
  removing the metering proxy models) would have been the actual shortcut;
  a clean compile break is the honest state to hand off.
- **Recovery condition**: Phase 3 of the repo-split plan implements the C2/C3
  clients and rewires these three files to use them instead of Prisma.
- **Progress (2026-07-24) - crash risk closed, real fix still blocked**: a
  code-state audit confirmed the runtime-crash risk described above was live
  on the request hot path - `QuotaService.assertAllowed` (called on every
  `/model-platform/chat` request) reached `findCurrentSubscriptionQuota`,
  which called the non-existent `prisma.tenantSubscriptionQuota` delegate.
  No test caught it because `quota.service.spec.ts` only unit-tested the pure
  `isModelAllowed` helper, and `model-registry.repository.spec.ts` mocked the
  ghost delegate directly rather than exercising real Prisma access.
  Fixed by removing the three ghost delegates and their `QuotaPoolRow`/
  `UsageEventRow`/`UsageSummaryRow` types from `service/src/prisma.ts`
  entirely (no more unsafe cast), and rewriting
  `findCurrentSubscriptionQuota`/`listSubscriptionQuotas`/`findUsageSummary`/
  `listUsageSummaries` in `model-registry.repository.ts` to return
  `null`/`[]` directly - matching the platform's own documented fail-open
  doctrine (`data_model_200_schema.md` §3) rather than crashing or denying.
  `QuotaService.assertAllowed` now treats "no quota resolvable" as bounded
  fail-open (allow, log a warning, skip model-allowlist gating since that
  gating is itself quota-config-derived and unenforceable without a real
  quota) rather than throwing `QUOTA_EXCEEDED`. Real quota resolution (a
  quota IS found) is unchanged. This closes the crash/silent-mismeter risk;
  it does **not** implement real C2/C3 wiring, which per TD-002's progress
  note is blocked on the platform's `product.agent_catalog` and out of this
  repo's control.

## TD-006 - provider API keys are env-var only (redeploy required to onboard/rotate)

- **What was missing**: `resolveApiKey` (`service/src/runtime/resolve-api-key.ts`)
  only read `process.env[model.config.apiKeyEnvVar]` - every new provider or
  key rotation required setting an env var and redeploying the service. The
  `key` schema (`key.provider_api_keys`/`key.key_rotation_logs`,
  `deploy/database/ddl/00_baseline.sql`) was designed for envelope-encrypted
  storage from the start but the Prisma proxy was never wired to any service
  code (see the migration note at the top of the `key` schema block in
  `service/prisma/schema.prisma`).
- **Why it is debt**: onboarding a third-party model provider is meant to be
  a routine, frequent operation (platform's operator console driving Atlas's
  `model-platform/admin` API) - forcing a deploy for every key defeats that
  and was flagged explicitly as unacceptable.
- **Recovery condition / Phase A (closed 2026-07-26)**: `service/src/provider-keys/`
  implements envelope encryption in-process (AES-256-GCM, `provider-key-crypto.ts`) -
  the master key set (`PROVIDER_KEY_ENCRYPTION_KEYS`/
  `PROVIDER_KEY_ENCRYPTION_ACTIVE_KEY_ID`) is still env-configured, but it is
  the rarely-rotated *master* key, not a per-provider secret. `ProviderKeyService`
  + `POST/PUT /model-platform/admin/provider-keys*` (S2sAuthGuard-protected,
  metadata-only responses - plaintext is write-only, never echoed) let an
  operator add or rotate a provider key as a plain DB write, no redeploy.
  `AiModelRecord.config.managedKeyAlias` (new, alongside the legacy
  `apiKeyEnvVar`/`keyReference.source: "env"`) selects `source: "managed"` in
  `model-admin.service.ts`'s `ModelKeyReference`, resolved at request time via
  `resolveApiKey`'s `resolveManagedKey` dependency - wired into the chat,
  embed, rerank, and parse paths identically.
- **Phase B evaluated and dropped (2026-07-26)**: the original plan was to
  swap the master-key source to an external KMS/Vault Transit unwrap call
  once the platform stood up that shared infrastructure. A repo-wide check
  (`vxture-platform` + `vxture-atlas`) found **no such infrastructure exists
  anywhere in the org today** - the documented secrets model
  (`vxture-platform/docs/10-standards/150-security.md` section 1.3) is
  GitHub Actions Secrets for CI/deploy-time plus chmod-600 plaintext `.env`
  files on the host at runtime (`/srv/vxture/runtime/secrets/*.env`) - the
  same pattern Atlas's own not-yet-exercised deploy secrets
  (`DEPLOY_WORKER02_SSH_KEY`/ACR/tailscale) already use. Building a one-off Vault/KMS
  integration just for this master key would be inconsistent, single-purpose
  infrastructure for marginal benefit over what Phase A already delivers.
  Decision: **closed as-is** - the master key stays env-configured (a rare,
  ops-driven rotation event, not a per-provider one), consistent with every
  other secret in the org. If the platform later stands up a shared
  secrets manager for unrelated reasons, the envelope-encryption schema in
  `service/src/provider-keys/` does not need to change to adopt it then -
  only the master-key-loading function would swap.

## TD-007 - provider-key vault has no admin/console UI or BFF coverage

- **What is missing**: every other model-platform resource
  (providers/models/grants/price-rules/policies/quotas/usage-summaries) has a
  working admin/console UI in `vxture-platform`
  (`portals/admin/src/modules/ai/ModelPlatformPage.tsx`,
  `ModelGrantsPage.tsx`, `portals/console/.../model-platform/`,
  `.../quotas/`) backed by typed BFF routers
  (`bff/admin-bff/src/routers/model-platform.router.ts`,
  `bff/console-bff/src/routers/model-platform.router.ts`) that proxy to
  Atlas's `model-platform/admin/*` API. The provider-key vault added in
  TD-006 (`model-platform/admin/provider-keys*` -
  list/create/rotate/activate/deactivate) has no equivalent - an operator
  can only manage provider keys by calling the API directly (`curl`/Postman
  with a valid S2S token), not through either portal.
- **Why it is debt, not just unscheduled**: this breaks the pattern every
  other resource already follows (UI and direct API calls both drive the
  same backing endpoint, no separate mutation path) and leaves the one
  resource type operators are most likely to touch routinely (onboarding a
  new third-party provider) as the one with no operator-facing surface at
  all - the opposite of what TD-006 was for (making that a routine,
  low-friction operation).
- **Recovery condition**: `vxture-platform` adds a "Provider Keys" section to
  `ModelPlatformPage.tsx` (or a new page) plus the matching admin-bff/
  console-bff router entries, following the exact shape already established
  for providers (list/create/activate/deactivate, with rotate as an
  additional action) - the API surface it would call
  (`model-platform/admin/provider-keys*`) already exists and is stable.
- **Why this is not implemented in this repo**: `vxture-atlas` is a
  services-profile repo with no `portals/` (product_240 section 2.5) - the
  UI and BFF code both live in `vxture-platform`, out of this repo's
  write-scope. Recording here per the platform's deviation-reporting
  discipline (this file's header) rather than silently leaving the gap
  undocumented.
- **Report to platform line**: handoff letter drafted,
  `docs/80-liaison/20-2607261200-atlas-provider-key-ui-handoff.md`.

## TD-008 - no capability-discovery endpoint (product_210 §11 item 6)

- **What is missing**: `vxture-platform`'s `docs/30-design/product_210_tool-protocol.md`
  v1.1 §11 (new 2026-07-27) requires every L1 provider shipping tool
  descriptors to expose `GET /.well-known/vxture-tools` (§4.2) - a
  tailnet-only, S2S-token-authenticated endpoint returning an array of tool
  descriptors (`name`, `title`, `description`, `input_schema`,
  `output_schema?`, `version`, `deprecated`, `metering?`, `authz?`) +
  `protocol_version`, so consumers (karda/arda/terra/L3 agents) can query
  availability instead of relying on liaison letters. Atlas has no such
  endpoint.
- **Why it is debt, not just unscheduled**: this is a newly-landed governance
  requirement (not something Atlas missed earlier), but Atlas already has
  four stable contract shapes to register - `atlas.chat` (generation),
  `atlas.embed`, `atlas.rerank`, `atlas.parse` (TD-003, contract layer
  already implemented and, per ADR-002, not expected to change shape even
  though real provider integration is still pending). There is nothing
  blocking registering them now.
- **Recovery condition**: add a `GET /.well-known/vxture-tools` route
  (S2sAuthGuard-protected, same as every other Atlas route) that returns the
  four descriptors above with `version: "1.0.0"`, `deprecated: false`, and
  `metering`/`authz` filled in per each capability's actual semantics
  (e.g. `atlas.chat`'s metering metric, `atlas.embed`'s batch/vector-dimension
  contract already documented in `docs/30-design/200-s2s-provider-surface.md`).
- **Self-check against product_210 §11 while building this**: per the same
  checklist this item exists because of, also confirm items 1-5/7 still hold
  for Atlas's existing embed/rerank/parse/chat contracts (auth path, error
  envelope, metering attribution, workspace-attribution principle, known-
  consumer broadcast, cross-repo fact backfill) - this is Atlas's own
  self-review obligation per §11, not a platform gate.
- **Report to platform line**: none needed - this is Atlas's own
  self-check obligation per product_210 §11 ("由 provider 在自己的设计评审中
  自查"), not something platform gates or needs to be notified of before
  implementation.
- **Progress (2026-07-27) - closed**: `GET /.well-known/vxture-tools`
  implemented (`service/src/discovery/discovery.controller.ts`,
  `tool-descriptors.ts`), `S2sAuthGuard`-protected like every other Atlas
  route, wired into `ModelPlatformModule`. Returns `protocol_version: "1.0"`
  plus the four descriptors (`atlas.chat`/`atlas.embed`/`atlas.rerank`/
  `atlas.parse`) with `input_schema`/`output_schema` (JSON Schema, hand-kept
  in sync with the real request/response types - no schema-from-TS pipeline
  exists yet), `version: "1.0.0"`, `deprecated: false`, and a `metering`
  declaration per capability. Self-check against product_210 §11 items 1-5/7
  re-confirmed unchanged (auth path/error envelope/metering
  attribution/workspace-attribution/known-consumer broadcast/cross-repo fact
  backfill - none of this endpoint's addition altered those). Unit test added
  (`discovery.controller.spec.ts`); full suite green (247/247), `tsc --noEmit`
  clean.

## TD-009 - `ModelGrantsPage.tsx` has no `taskProfile` field

- **What is missing**: TD-003b added `taskProfile` to `model.model_grants`
  and the admin grant CRUD API (`model-platform/admin/grants*`) already
  accepts/returns it. `vxture-platform`'s admin portal
  (`portals/admin/src/modules/ai/ModelGrantsPage.tsx`) has a working
  create/update grant form (agentId, priority, reason) but no `taskProfile`
  input - an operator can only set it by calling the API directly with a
  valid S2S token, not through the UI.
- **Why it is debt, not just unscheduled**: same shape as TD-007 - Atlas
  ships a backend capability, the platform-side operator surface doesn't get
  updated in lockstep, so the one thing operators are most likely to want to
  configure routinely (which model a taskProfile resolves to, per tenant) has
  no operator-facing surface.
- **Recovery condition**: `vxture-platform` adds a `taskProfile` text input
  to `ModelGrantsPage.tsx`'s grant create/update form, following the same
  shape as the existing agentId/priority/reason fields - the API it would
  call already exists and is stable.
- **Why this is not implemented in this repo**: same as TD-007 - `vxture-atlas`
  is a services-profile repo with no `portals/`, the UI lives in
  `vxture-platform`, out of this repo's write-scope.
- **Report to platform line**: reported alongside TD-007 in
  `vxture-platform`#148 (`liaison`), which also raises a broader architecture
  question - whether Atlas's admin surface living entirely in a different
  repo is the right long-term shape, given this is the second time a shipped
  Atlas capability has had no operator-facing surface, plus an industry
  comparison (ops/admin vs tenant console vs product-embedded surface) for
  the platform line to weigh. Marked explicitly as a discussion/decision
  item, not just a bug report.

## TD-010 - non-UUID tenantId/applicationId crashed as an unhandled 500

- **What was broken**: `model.model_grants.tenant_id`/`application_id` are
  `uuid` columns (`deploy/database/ddl/00_baseline.sql`) with no FK
  (boundary #1 - cross-database, consistency enforced at the application
  layer, not the DB). Nothing validated the shape of these values before
  they reached Postgres. `ModelRegistryRepository.findBestGrant` (existing,
  used by every chat/embed/rerank/parse call via `QuotaService.assertAllowed`)
  and the two methods this session's TD-003b work added
  (`findModelCodeForTaskProfile`, `listGrantedModels`) all took a raw,
  caller-supplied `tenantId`/`applicationId` string straight into a Prisma
  query. A non-UUID value crashed with an unhandled
  `Inconsistent column data: Error creating UUID` Prisma error - surfaced as
  an opaque `500 Internal server error` with no structured code, not a
  `400`.
- **How it was found**: karda's first real end-to-end probe against
  production (`vxture-atlas`#47, 2026-07-27) - not caught earlier because
  every prior test exercised this code path through a mocked
  `ModelRegistryRepository`/`ModelRegistryService`, never a real Prisma
  client against a real Postgres. karda's actual tenant identifier is a
  composite org/workspace string, not a bare UUID - passing that straight
  through as `tenantId` is exactly what crashed.
- **Root cause, precisely**: `GET /model-platform/models?tenantId=` and the
  `taskProfile` resolution path both trust a caller-supplied string as-is;
  `findBestGrant` (pre-existing) has the same exposure for `ChatRequest.tenantId`
  once a real `modelCode` is given (not hit by karda's probe only because
  they tested with a dummy `modelCode`, which 404s before reaching the grant
  lookup).
- **Fix (2026-07-27)**: added `assertUuid()` in
  `model-registry.repository.ts`, called at the top of `findBestGrant`,
  `findModelCodeForTaskProfile`, and `listGrantedModels` - a malformed
  `tenantId`/`applicationId` now throws `ModelRuntimeException(400,
  "INVALID_TENANT_ID"` or `"INVALID_APPLICATION_ID")` before any Prisma call,
  with a message telling the caller to use the platform tenant/workspace
  UUID from their token context, not an internal composite identifier.
  Reproduced the original crash against a real local Postgres (DDL applied,
  seeded data) before the fix and confirmed the clean `400` after - not just
  unit-tested against a mock. 5 new tests added
  (`model-registry.repository.spec.ts`), full suite green (261/261),
  `tsc --noEmit` clean.
- **Not fixed here (deliberately out of scope)**: whether `tenantId` should
  be *derived from the verified S2S token's `workspaceId` claim* instead of
  trusted as a client-supplied query param/body field at all - that would
  also close a tenant-enumeration risk (any valid S2S token could currently
  query grants for an arbitrary `tenantId`, not just its own), mirroring the
  platform's own known gap (`vxture-platform` TD-035 - S2S token identity not
  bound to workspace/product params on platform routers). Recording this as
  a follow-up, not blocking the hotfix - the immediate crash is what karda
  was blocked on.
- **Report to karda line**: replied directly in `vxture-atlas`#47 with the
  root cause and the fix, once deployed.
