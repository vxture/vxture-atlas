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
| TD-002 | Usage-metering write path is a no-op, inherited from the in-monorepo implementation | 2026-07-24 | closed 2026-07-28 - superseded by TD-017 parts 1/2, which is exactly this: Atlas now writes its own `reqlog` and reports realized consumption to the platform via C3 consume |
| TD-003 | S2S provider surface (embedding/parse/rerank) not designed; karda has submitted field-level requirements as design input | 2026-07-24 | contract layer landed 2026-07-24 (`POST /v1/embed`\|`/v1/rerank`\|`/v1/parse`, S2sAuthGuard, model/quota gating, G1 error envelope); real provider integration still open (product/cost decision) - A2.3 (parse deployment affinity) resolved 2026-07-27 (same host, worker-02, see progress note); A3.3 (rerank latency) still needs real benchmarking - blocked on a real provider, not actionable yet; new platform governance checklist (product_210 §11) to self-check future changes against, see progress note |
| TD-004 | BFF-to-service auth is currently unauthenticated (plain fetch, diagnostics-only guard) | 2026-07-24 | partially closed 2026-07-24 - Atlas-side S2S token verification (callee half) landed; platform-side token-exchange issuance + BFF/varda client wiring (caller half) still open |
| TD-005 | `quota.service.ts`/`metering.service.ts`/`model-registry.repository.ts` reference Prisma models removed from `prisma/schema.prisma` during the physical DB split | 2026-07-24 | closed 2026-07-28 - crash risk closed 2026-07-24; real per-workspace quota wiring landed via TD-016 (C2); the remaining dead code (a second, unreachable quota-and-model-allowlist path) removed outright rather than "finished" - see progress note for why it could never be finished |
| TD-006 | Provider API keys resolved only via `apiKeyEnvVar` (env var) - onboarding or rotating a provider key requires a redeploy | 2026-07-26 | closed 2026-07-26 (envelope-encrypted provider-key vault, `key.provider_api_keys`, no redeploy for add/rotate); the originally-planned Phase B (external KMS/Vault for the master key) was evaluated and dropped - no org-wide KMS/Vault exists anywhere today, see progress note |
| TD-007 | Provider-key vault (`capability/provider-keys*`, renamed 2026-07-28 from `model-platform/admin/provider-keys*` - see TD-013) has no admin/console UI or BFF coverage in vxture-platform, unlike every other model-platform resource | 2026-07-26 | open - not this repo's write-scope; handoff letter sent, see progress note |
| TD-008 | Atlas has no `GET /.well-known/vxture-tools` capability-discovery endpoint, now required by product_210 §11 item 6 for any L1 provider shipping tool descriptors | 2026-07-27 | closed 2026-07-27 - `GET /.well-known/vxture-tools` implemented (`service/src/discovery/`), `S2sAuthGuard`-protected, registers all four `atlas.*` descriptors at `version: "1.0.0"` |
| TD-009 | `ModelGrantsPage.tsx` (vxture-platform admin portal) has no `taskProfile` form field - operators can only configure task-profile routing (TD-003b) via raw API call, not through the Admin UI | 2026-07-27 | open - not this repo's write-scope; same pattern as TD-007 (backend shipped, platform UI not updated); reported alongside TD-007 in `vxture-platform`#148 (marked discussion/decision, also raises the broader architecture question of Atlas's admin surface living entirely in a different repo) |
| TD-010 | A non-UUID `tenantId`/`applicationId` reaching `model.model_grants` (a `uuid` column) crashed as an unhandled Prisma error - opaque `500`, found live via karda's first real end-to-end probe (`vxture-atlas`#47) | 2026-07-27 | closed 2026-07-27 - `ModelRegistryRepository.findBestGrant`/`findModelCodeForTaskProfile`/`listGrantedModels` now validate UUID format before querying, throwing a clean `400 INVALID_TENANT_ID`/`INVALID_APPLICATION_ID` instead; reproduced and verified against a real local Postgres before/after the fix |
| TD-011 | TD-003b's `model_grants.task_profile` column shipped only in `00_baseline.sql` (create-once, no-op against an already-provisioned table) with no incremental migration - production never actually got the column, so every grant/taskProfile query 500'd for real (karda re-test, `vxture-atlas`#47) even after TD-010's fix | 2026-07-28 | closed 2026-07-28 - added `deploy/database/ddl/incr/01_model_grants_task_profile.sql`; also discovered and fixed `00_baseline.sql` was missing `IF NOT EXISTS` on every `CREATE TABLE`/`CREATE INDEX` (contradicting its own db-init.yml's documented "every statement is IF NOT EXISTS" assumption) - re-running `db-init apply` against an already-initialized database would have failed at the first statement, before ever reaching `incr/`; fixed all 14 tables + all indexes. Verified against a real local Postgres: reproduced the exact production state (old baseline, no column), applied the fixed baseline+97+98+incr sequence twice in a row, both clean |
| TD-012 | `model_code` is sent verbatim as the upstream provider's `model` field (`buildOpenAiCompatibleBody`, no prefix-stripping) - a `{provider_code}/{vendor_model_name}`-prefixed code (per `vxture-platform`'s `42-model-provider-registry-plan.md` §1 convention, e.g. seeded `deepseek/deepseek-chat`) 404s against the real upstream API, confirmed live with both `doubao`/`zhipu` during `vxture-atlas`#47 testing (2026-07-28) | 2026-07-28 | workaround confirmed working 2026-07-28 - `doubao-seed-2-0-lite-260428`/`doubao-seed-2-0-pro-260215`/`glm-5.2` (bare, no prefix) all returned real `201` generations for karda's test tenant, full chain (token-exchange -> verify -> route -> grant -> upstream inference) proven end to end, `vxture-atlas`#47/`vxture-karda`#76/`vxture-platform`#145/#147 all closed. The underlying naming-convention question is still open at `vxture-platform`#152 - only the immediate blocking impact is resolved, not the convention itself |
| TD-013 | `model-platform` was never a deliberate API namespace - a leftover package name (`@vxture/service-model-platform`) carried into route prefixes at repo-split time, applied inconsistently (health duplicated under both bare and prefixed paths) and, for the admin surface, now actively wrong given product_250's BSS/OSS split | 2026-07-28 | closed 2026-07-28 - paths renamed + legacy `model-platform/*` retired outright (no alias, accepting cross-repo breakage); part 3 then renamed the service identity, metric label, package, and module family to `atlas` after self-review caught that only the paths had been done |
| TD-014 | Build provenance never reached the image: `build.yml` passed `APP_VERSION`/`GIT_SHA`/`BUILD_TIME`/`DEPLOY_STAGE` as build-args but `service/Dockerfile` declared no matching `ARG`, so Docker silently dropped all four and production `/healthz` reported `version:"dev"`, `gitSha:"unknown"`, `stage:"dev"` - violating standard 025 §4/§6/§7, the exact failure mode that standard exists to prevent | 2026-07-28 | closed 2026-07-28 - four `ARG`+`ENV` added to the runtime stage with honest defaults; found by self-review, after the v0.1.9 deploy verification had to fall back to `docker ps` image tags because the health endpoint could not say which build was live |
| TD-015 | `.well-known/vxture-tools` capability discovery cannot convey *where* to call: product_210 §4.1's `ToolDescriptor` shape has no endpoint/path field, so a consumer polling discovery learns names/schemas/metering but not URLs - meaning TD-013's path retirement could not self-announce and consumers found out by 404 | 2026-07-28 | closed 2026-07-28 - platform shipped the prerequisite same-day (`product_210_tool-protocol.md` §4.1a, `endpoint: {method, path}`, platform#173); Atlas mirrored it into `discovery.types.ts`/`tool-descriptors.ts` and populated it on all four descriptors |

| TD-016 | `CLAUDE.md` and `.env.example` claim a C2 entitlement client (`PLATFORM_API_URL`); no such client exists - the variable is read by zero lines of code, so TD-005's quota fail-open has no mechanism by which it could ever stop being the permanent steady state | 2026-07-28 | partially closed 2026-07-28 - the client exists now (`PlatformEntitlementClient`, shared-secret path, short-TTL cache) and the quota gate can deny for the first time when the platform reports pools exhausted; enforcement of the *uncovered* case stays permissive until the platform publishes a real `atlas` plan_version, which it says is still a draft skeleton |
| TD-017 | Atlas records no usage anywhere: `recordUsage()` logs and returns null, `upsertUsageSummary()` persists nothing, no `POST /usage/consume` client exists, and `reqlog.request_records` (deployed, partitioned, Prisma-modelled) has no writer - so the designated sole inference-metering entry point for every vxture product has captured nothing, including karda's live traffic | 2026-07-28 | closed 2026-07-28 - part 1 (own `reqlog` writes) and part 2 (C3 `POST /usage/consume` caller) both shipped. Atlas now records every served request locally and reports realized token consumption to the platform metering kernel; a served-but-unbilled request is visible as `billed_amount IS NULL` |
| TD-018 | `reqlog.*` monthly partitions are pre-built only through 2027-01 with a DEFAULT catch-all and no roll-forward job, so from 2027-02 all rows land in DEFAULT and drop-based retention silently stops working | 2026-07-28 | closed 2026-07-28 - `reqlog.ensure_partitions`/`drop_expired_partitions` added as db-init-applied DDL (the sole sanctioned structure-change path), retention set to 6 months, and a `reqlogPartitions` readiness check added so exhaustion can no longer fail silently; verified against a real Postgres incl. the expiry drop and DEFAULT-occupancy detection |
| TD-019 | `.well-known/vxture-tools` advertises `atlas.parse` with `deprecated: false`, formally identical to the three real capabilities, but no provider implements `parseDocument` - every call returns 501, so Atlas publishes a capability claim it does not honour to the very mechanism product_210 §11 makes consumers rely on | 2026-07-28 | open - parse withheld from the published manifest as an interim fix; needs a real provider (#38) or a maturity field on the descriptor (platform#159) |

| TD-020 | Branch protection was advisory for admins: `main-ruleset.json` declared `bypass_actors: [RepositoryRole 5 (admin), bypass_mode: always]`, so a direct `git push origin main` from an admin account succeeded silently despite CLAUDE.md stating direct pushes are BLOCKED - found when exactly that push went through by accident. All five org repos (atlas/platform/karda/arda/template) carried the same bypass | 2026-07-28 | atlas + platform closed 2026-07-28 - Atlas fixed its own live ruleset and reference file; platform's live ruleset was independently already `[]` and its reference artifact + governance doc fixed too (platform#172). Remaining exposure is karda/arda/template only - outside both atlas's and platform's write-scope, tracked per-repo (karda#82/arda#187/template#37) |

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
- **Progress (2026-07-28) - additive `/v1/chat` alias landed**: the
  "coordinated, additive migration" this entry called for started -
  `ModelRuntimeController` now registers under both `["model-platform", "v1"]`
  (Nest's native multi-prefix `@Controller` support, zero route duplication),
  so `/v1/chat`/`/v1/models` work identically to the legacy path. The legacy
  path is untouched - `model-runtime-client` still hardcodes it and keeps
  working unchanged. New consumers (karda) should prefer `/v1/*` for
  consistency with A1-A3. `#40` stays open until `model-runtime-client` is
  actually migrated and the legacy path has a real deprecation timeline -
  this only closes the "can a new consumer use a consistent path today" gap.

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
  (`capability/provider-keys*`, renamed 2026-07-28, see TD-013) already
  exists and is stable.
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
  and the admin grant CRUD API (`capability/grants*`, renamed 2026-07-28 from
  `model-platform/admin/grants*` - see TD-013) already accepts/returns it. `vxture-platform`'s admin portal
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

## TD-013 - `model-platform` route-prefix cleanup

- **What was wrong**: `model-platform` was never a chosen API namespace - it
  is the literal name of the in-monorepo NestJS module
  (`@vxture/service-model-platform`) this repo was extracted from, carried
  into route prefixes at extraction time without review. Two concrete
  problems, not just aesthetics: (1) health checks were duplicated under both
  bare `/healthz` and prefixed `/model-platform/health/{live,ready,diagnostics}`
  - two names for the same three checks, an accident of the same copy-paste;
  (2) the admin surface (`model-platform/admin/*`) kept the word "admin" even
  after `product_250_management-plane-contract.md` M-4 (decided 2026-07-28)
  reclassified this "capability & service" domain as OSS, migrating out of
  `admin-bff`/BSS into a dedicated `capconsole-bff` with its own
  operator-token auth (`vxture-atlas`#52) - "admin" now specifically means
  BSS on the platform side, so the old prefix was actively misleading, not
  just stale.
- **Target namespace (final)**:
  - `/v1/*` - S2S data plane (chat/models/embed/rerank/parse). Already
    correct, unchanged by this entry.
  - `/capability/*` - OSS operator surface (registry CRUD + provider-keys),
    replaces `/model-platform/admin/*`. Named to mirror the already-decided
    "Capability Console" UI (`portals/capconsole`), consumed by
    `capconsole-bff` per product_250 M-4. Auth stays `S2sAuthGuard` for now;
    swaps to operator-token verification separately under `vxture-atlas`#52.
  - `/healthz`, `/readyz`, `/internal/diagnostics` - deduplicated health set,
    replaces both the bare and `/model-platform/health/*` pairs. `/status`
    (human-readable) is unaffected, it never carried the prefix.
  - `/.well-known/vxture-tools` (discovery) and `/provisioning/webhook` (C3) -
    unchanged, both fixed by external cross-repo protocol contracts, not this
    repo's naming to pick.
- **Done in this repo (2026-07-28, two-part)**:
  - Part 1: `ModelAdminController`/`ProviderKeyController` moved to
    `capability`/`capability/provider-keys`; `HealthController` collapsed to
    `healthz`/`readyz`/`internal/diagnostics`; `docker-compose.yml`
    healthcheck, `deploy/deploy.sh`'s `cmd_verify`, and the `Dockerfile`
    comment updated to match. Legacy paths initially kept as additive
    aliases pending cross-repo coordination.
  - Part 2 (same day, explicit product decision): the additive-alias
    approach was overridden - **all** `model-platform/*` paths retired
    outright, no alias, in favor of forcing the coordination rather than
    letting a "temporary" alias become permanent (the exact failure mode
    this entry exists to fix). `runtime.controller.ts` now only serves
    `/v1/*`; `model-admin.controller.ts`/`provider-key.controller.ts` only
    serve `/capability/*`. `docs/20-specs/10-http-surface.md` rewritten to
    show only the final state, no alias rows. Doc references in
    `50-deployment/00-index.md` and `30-design/200-s2s-provider-surface.md`
    updated (historical/append-only docs - ADRs, dated workplan "done"
    notes, archived liaison letters - left as-is, they describe state at
    the time written, not current state).
- **Breaks now, needs the other repo to fix (not this repo's write-scope)**:
  three known callers in `vxture-platform` will 404 against Atlas until
  updated:
  1. `packages/ai/model-runtime-client/src/llm/client.ts` (2 call sites,
     `/model-platform/chat`) - consumer: `agent-server/varda`.
  2. `bff/admin-bff/src/routers/model-platform.router.ts` (29 call sites,
     `/model-platform/admin/*`, full registry surface) - consumer: the admin
     portal's AI/model-platform pages.
  3. `bff/console-bff/src/routers/model-platform.router.ts` (5 call sites,
     `/model-platform/admin/*` read-only subset: models/grants/quotas/
     usage-summaries) - consumer: the tenant console's model-platform pages.
  All three need their literal path strings swapped to `/v1/*` or
  `/capability/*` per `docs/20-specs/10-http-surface.md`. No deploy-window
  coordination needed on Atlas's side beyond not tagging a production
  release until told to - merging to `main` does not deploy (see repo
  branch model).
- **Report to platform line**: `vxture-platform`#144 (model-runtime-client)
  and #148 (admin-bff/capconsole-bff sequencing) both commented with the
  breaking-change list; dedicated actionable issue filed at
  `vxture-platform`#156.
- **Part 3 (2026-07-28, found by self-review after the deploy)**: parts 1-2
  renamed the *paths* but left the name alive everywhere else - the service
  still self-identified as `model-platform` in every `/healthz` + `/readyz`
  identity block (standard 025 §3 `service` field), in the Prometheus label
  `component`, and in the `/status` page title, while the package
  (`@vxture/service-model-platform`), root module (`ModelPlatformModule`),
  and the whole `ModelPlatform*` symbol family kept the original name. The
  health identity and metric label are arguably *more* visible than the
  paths, since ops aggregation keys on them. All renamed to `atlas` /
  `@atlas/service` / `AtlasModule` / `Atlas*`; `@atlas/service` matches the
  sibling convention for independent product repos (`@arda/app`,
  `@karda/app`), not the `@vxture/service-*` shape inherited from the
  monorepo. Verified no consumer keyed on the old identity: repo-wide search
  of `vxture-platform` for `service="model-platform"` / `component=...`
  aggregation in dashboards, alert scripts, and configs returned nothing, so
  unlike the path retirement this rename breaks no known consumer. The
  `@package` JSDoc headers were updated too (they name the package the file
  itself belongs to, which did change). What is deliberately left alone: the
  narrative "extracted from `@vxture/service-model-platform`" references in
  `CLAUDE.md`/`README.md`/`docs/90-memory/10-agent.md`, which describe the
  upstream in-monorepo package - that package genuinely still carries that
  name inside `vxture-platform`, so rewriting those sentences would make the
  history wrong rather than current.

## TD-014 - build provenance never reached the image

- **What was broken**: `.github/workflows/build.yml` (lines ~182-187)
  correctly derived and passed `APP_VERSION`/`GIT_SHA`/`BUILD_TIME`/
  `DEPLOY_STAGE` as build-args, per standard 025 §4.2. `service/Dockerfile`
  declared **no** matching `ARG`, and Docker silently discards build-args a
  Dockerfile does not declare - so none of the four ever became an `ENV`, and
  `buildHealthIdentity` (`@vxture/shared`) fell back to its honest defaults
  on every build.
- **Observed in production**: `GET /healthz` on worker-02 immediately after
  the v0.1.9 deploy returned `"version":"dev"`, `"gitSha":"unknown"`,
  `"stage":"dev"`, `"buildTime":"unknown"`. Standard 025 §1 names this exact
  symptom as the motivating incident class, §6 lists it as a forbidden
  anti-pattern, and §7 item 5 makes "verify these are real values, not
  dev/unknown/local" a post-deploy compliance check that had never been run
  here.
- **Why it mattered concretely**: verifying that v0.1.9 was actually live -
  during a breaking change, where knowing the running build is the whole
  question - could not be done from the service itself. It had to fall back
  to reading image tags off `docker ps`. The health endpoint is supposed to
  be the runtime version source of truth (standard 025 §1) and was carrying
  no information.
- **Fix (2026-07-28)**: added the four `ARG`s plus the `ENV` block to the
  Dockerfile's `runtime` stage, with the standard's honest defaults
  (`dev`/`unknown`) so a plain local `docker build` still works and reports
  truthfully. No workflow change was needed - that half was already correct.
- **Follow-up**: the post-deploy check from standard 025 §7 item 5 is not
  automated anywhere. `deploy.sh`'s `cmd_verify` only asserts `/healthz`
  returns 200, not that the identity block carries real values - which is
  why this survived every prior deploy. Worth folding into `cmd_verify`,
  recorded here rather than silently skipped.

## TD-015 - capability discovery cannot convey endpoint paths

- **What is missing**: `product_210_tool-protocol.md` §4.1's `ToolDescriptor`
  shape (mirrored in `service/src/discovery/discovery.types.ts`) carries
  `name`/`title`/`description`/`input_schema`/`output_schema`/`version`/
  `deprecated`/`metering`/`authz` - and no field saying *where* the tool is
  invoked. A consumer can discover that `atlas.chat` exists, what it accepts,
  and how it meters, but not the URL to POST to.
- **Why it is debt, not a nitpick**: product_210 §11 item 6 requires that
  "consumers should be able to learn availability by querying the discovery
  endpoint, not by being told in a letter". TD-013 retired every legacy path
  in this repo; a consumer polling `.well-known/vxture-tools` across that
  change would have seen **zero** difference in the response and still 404'd,
  because the one thing that changed is the one thing the descriptor cannot
  express. The discovery mechanism was exactly the tool that should have made
  that rename self-announcing, and it structurally could not.
- **Why this is not fixed in this repo**: adding a non-standard `endpoint`
  field to Atlas's descriptors would be inventing a protocol extension inside
  a product repo, which CLAUDE.md forbids ("fix the standard in the platform
  repo first, then mirror it here"). The descriptor shape is the platform
  line's to change.
- **Recovery condition**: `product_210_tool-protocol.md` §4.1 gains an
  endpoint/path field (plus a `protocol_version` bump per its own §122
  evolution rule); Atlas then mirrors it in `discovery.types.ts` +
  `tool-descriptors.ts`, which is a small additive change here.
- **Report to platform line**: proposal filed as `vxture-platform`#159, with the TD-013 path retirement as the motivating evidence.

## TD-016 - C2 entitlement client does not exist

- **What the docs claim**: `CLAUDE.md` lists "C2 entitlement client" among
  what Atlas *does* carry from the governance base, and `.env.example`
  declares `PLATFORM_API_URL` with a note about the S2S egress guard.
- **What is actually true**: `PLATFORM_API_URL` is read by **zero lines** of
  `service/src`. There is no entitlement client, no C2 call, no resolver -
  mock or otherwise. The claim is not "implemented but unwired", it is
  absent.
- **Why it matters beyond tidiness**: TD-005's fail-open depends on "the real
  quota source cannot be resolved *yet*". With no C2 client there is no
  mechanism by which it ever could resolve, so the fail-open is not a
  temporary bounded degradation - it is the permanent steady state, and the
  quota gate is decorative. Reading the code, this is easy to mistake for a
  wiring gap; it is a missing component.
- **Recovery condition**: an entitlement client that reads `PLATFORM_API_URL`
  and resolves workspace entitlements over the tailnet S2S surface, feeding
  `QuotaService` a real quota source so the fail-open branch stops being the
  only reachable one.
- **Correction shipped with this entry**: `CLAUDE.md`'s inherited-capability
  line corrected from asserting the client exists to naming it as pending,
  so the repo's own governance summary stops being wrong.

## TD-017 - Atlas records no usage anywhere (the metering entry point is empty)

- **Relationship to TD-002**: TD-002 recorded this as "usage-metering write
  path is a no-op, inherited from the in-monorepo implementation" and framed
  it as blocked on the platform's `product.agent_catalog`. That framing
  understates it, so this entry restates the actual scope.
- **What is actually true** (verified 2026-07-28 by reading the write path
  end to end): `MeteringService.record()` -> `recordUsage()` logs a warning
  and returns `null`. `upsertUsageSummary()` returns an in-memory projection
  and persists nothing (its own comment says so). No `POST /usage/consume`
  client exists, so nothing reaches the platform's metering kernel either.
  `reqlog.request_records` - Atlas's own detailed-history table, which is
  deployed, partitioned, and modelled in Prisma with a generated delegate -
  is written by no application code.
- **Why this is more than a missing feature**: `CLAUDE.md` designates Atlas
  "the sole inference-metering entry point for every other vxture product" -
  karda/arda/varda token usage all flows through Atlas's consume path. Every
  real generation served to date (karda's live integration, `vxture-atlas`#47)
  is therefore unrecorded on both sides. There is no data to backfill from:
  the events were never captured.
- **Boundary is not the blocker**: the platform/Atlas split is already
  designed and both sides already have physical tables - see
  `docs/30-design/210-usage-metering-and-history.md`. What is missing is the
  writing code on Atlas's side (its own `reqlog` insert) and the consume
  client (the platform's half).
- **Recovery condition**: (1) write `reqlog.request_records` +
  `reqlog.error_records` on every A1-A4 call - this half depends on nothing
  external and can land immediately; (2) call the platform's
  `POST /usage/consume` with `{workspace, product, metric, amount,
  idempotency_key, request_id}` and echo the returned event id back into
  `usage_event_id`. Step 1 is independently valuable: it makes the gap
  measurable and gives reconciliation a left-hand side.

## TD-018 - reqlog partitions run out 2027-01, then retention silently breaks

- **What is wrong**: `00_baseline.sql` pre-builds monthly partitions for
  `reqlog.request_records` / `reqlog.error_records` from 2026-07 for seven
  months (`FOR i IN 0..6`), i.e. **through 2027-01**, plus a `DEFAULT`
  catch-all. Its own comment states a maintenance job "should roll this
  forward (create month-after-next, detach+drop expired partitions) once
  deployed" - no such job exists.
- **Failure mode**: nothing breaks loudly. From 2027-02 every write lands in
  the DEFAULT partition and keeps working, so there is no error to notice.
  But drop-based retention - the entire reason the tables are partitioned -
  stops being possible, because expired rows are no longer isolated in a
  droppable child. The longer it runs undetected the more expensive the
  eventual repartition.
- **Why it is not urgent yet but must not be forgotten**: today nothing
  writes these tables at all (TD-017), so the DEFAULT partition stays empty.
  The moment TD-017 is fixed, this becomes a live clock.
- **Recovery condition**: a scheduled job (pg_cron on the Atlas database, or
  an external scheduler alongside the existing deploy tooling) that creates
  the month-after-next partition and detaches/drops partitions past the
  retention window - plus an agreed Atlas-side retention period, which
  `docs/30-design/210-usage-metering-and-history.md` §6 flags as still
  undecided.

## TD-019 - capability discovery advertises `atlas.parse` as available when no provider implements it

- **What is wrong**: `.well-known/vxture-tools` publishes `atlas.parse` with
  `deprecated: false` and a full `metering` declaration, formally
  indistinguishable from `atlas.chat`/`embed`/`rerank`, which are really
  served. **No provider overrides `parseDocument`** - `BaseProvider`'s
  default throws, so every parse call returns `501 MODEL_NOT_IMPLEMENTED`.
- **Why it is a contract problem, not just a missing feature**: TD-003
  already records "no real parse provider" as an implementation gap. This
  entry is about the *advertisement*: product_210 §11 item 6 makes discovery
  the mechanism consumers use to learn what is available instead of asking.
  A consumer doing exactly that (karda has A2 requirements pending) is told
  parse is available and finds out otherwise by 501. Atlas is publishing a
  capability claim it does not honour.
- **Why the protocol cannot express the truth today**: `ToolDescriptor` has
  `deprecated` (retiring) but nothing for "defined, not yet implemented".
  Marking parse `deprecated: true` would be a lie of a different shape.
  This is the same descriptor-expressiveness gap as TD-015 - the shape
  cannot describe a capability's real maturity.
- **Interim fix shipped with this entry**: `atlas.parse` is withheld from
  the published manifest until a provider implements it - a consumer that
  cannot see it will ask, which is strictly better than one that sees it and
  gets a 501. The descriptor stays in source, feature-gated, so restoring it
  is a one-line change when A2 lands.
- **Recovery condition**: a real parse provider (tracked `vxture-atlas`#38),
  or a maturity field on the descriptor (tracked `vxture-platform`#159) that
  lets Atlas advertise it honestly as not-yet-implemented.

### TD-017 part 1 - progress note (2026-07-28)

- **Shipped**: `service/src/reqlog/` (`RequestLogService`) writes
  `reqlog.request_records` on every A1-A4 call and `reqlog.error_records`
  alongside it on failure. Wired into the chat path (success, quota/grant
  rejection, and all-candidates-exhausted) and, via `withRequestLog` in
  `s2s-provider.shared.ts`, into embed/rerank/parse - **which previously
  recorded nothing at all**, not even the no-op metering call the chat path
  made. That gap was wider than TD-017 originally stated.
- **Attribution comes from the verified token**: controllers pass
  `req.s2sAuth` (populated by `S2sAuthGuard` from the `workspace_id` and `sub`
  claims) as an explicit argument. It is deliberately *not* a request-body
  field - product_210 rule 8 forbids trusting caller-supplied org/workspace
  context, and a body field would be trivially spoofable. This also gives
  `workspace_id`/`user_id` a trustworthy source, which the body never had.
- **A malformed dimension does not lose the row**: the attribution columns are
  `uuid`, and karda's real `tenantId` is a composite string (TD-010). On the
  request path that is rightly a 400; here it is coerced to NULL, because
  refusing to log would also discard the model/provider/token facts that were
  valid. Verified against a real Postgres (baseline DDL applied, rows read
  back): a non-UUID `tenantId` landed NULL while `workspaceId`, `userId`,
  `modelCode`, `providerCode`, tokens and latency all persisted correctly, and
  the failure pair wrote to both tables.
- **Logging never fails the request it describes**: every write is wrapped -
  a log failure produces a warning, never an error for the caller. Covered by
  test.
- **Deliberately still NULL**: `product_id` (the token carries the caller's
  product *code*, this column wants the platform's product uuid - needs the
  cross-database read TD-005/TD-016 track) and `usage_event_id`/`billed_*`
  (part 2). A NULL `usage_event_id` is the documented reconciliation signal
  from `docs/30-design/210-usage-metering-and-history.md` §4, not missing data.
- **Known limitation**: A1/A3 provider responses carry no token counts (Zhipu
  reports none for embedding/rerank), so those columns stay NULL for those
  capabilities rather than being invented. Latency and attribution are real.

### TD-018 - progress note (2026-07-28, closed)

- **Retention decided**: 6 months (owner, 2026-07-28) - twice the platform's
  finest summary tier so cross-quarter reconciliation and incident lookback
  both work, while staying bounded for a per-request table. Recorded in
  `docs/30-design/210-usage-metering-and-history.md` §6, which previously
  flagged this as undecided.
- **Mechanism**: `deploy/database/ddl/incr/02_reqlog_partition_maintenance.sql`
  installs `reqlog.ensure_partitions(months_ahead)` and
  `reqlog.drop_expired_partitions(retain_months, dry_run)`, then calls
  `ensure_partitions(12)` - so applying the file is itself a maintenance pass
  and a single db-init run restores 12 months of runway. Expiry is
  deliberately **not** invoked by the file: dropping data must be an explicit
  act with `dry_run=false`, never a side effect of applying DDL.
- **Why not pg_cron or an in-app scheduler**: creating a partition is a DDL
  structure change, and `140-repo-governance-standard.md` §6 makes db-init
  (`confirm=yes` + `expected_sha` + production approval) the sole sanctioned
  path, explicitly stating the routine deploy chain must not run
  migration/seed. An in-app job would turn the application into an unaudited
  structure-change path - trading a silent retention failure for a silent
  governance violation. `postgres:16-alpine` also ships no pg_cron.
- **The real fix is the alarm, not the automation**: TD-018's danger was that
  exhaustion is *silent* - writes keep succeeding into DEFAULT while
  drop-based retention quietly becomes impossible. `/readyz` now carries a
  `reqlogPartitions` check with two independent signals: `monthsAhead` (warn
  below 2) and `defaultPartitionRows` (fail above 0 - any row there means
  retention is already broken, not merely about to be). Monthly cadence can
  now be driven by an observable signal rather than someone's memory.
- **Verified against a real Postgres**, not only mocks: baseline + this file
  applied cleanly; re-running created 0 new partitions (idempotent); an
  artificially aged partition was reported by `dry_run` and then really
  detached+dropped; the `DEFAULT` partition was never touched; the exact
  runway query returned 13 months; and a write dated beyond the runway landed
  in DEFAULT and was detected. Three readiness tests cover warn/fail/pass.
- **Remaining gap, reported not worked around**: the governance standard has
  no sanctioned path for *recurring* DB maintenance - only manually-approved
  one-off runs. Today that means someone must trigger db-init roughly twice a
  year (12-month runway, warn at 2). Raised as `vxture-platform`#164, which
  proposes the standard grow a third category - *sanctioned recurring
  maintenance* - alongside "deploy" and "authorized structure change": a
  scheduled auditable path restricted to a pre-approved set of idempotent
  operations, so the operation set is approved once instead of every run.
  Left to the platform line to decide once for every repo with partitioned
  tables, rather than each inventing its own mechanism.

## TD-020 - branch protection was advisory for admins

- **What was wrong**: `docs/50-deployment/rebuild/main-ruleset.json` - the
  authoritative ruleset - declared
  `bypass_actors: [{actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always"}]`.
  `actor_id 5` is the repo **admin** role, and `always` means bypass in every
  situation, including a direct push. So all five rules (PR required, five
  required checks, linear history, no force-push, no deletion) were advisory
  for any admin. This was not configuration drift: the live ruleset matched
  the file exactly. The declaration itself contradicted `CLAUDE.md`'s stated
  guarantee that "Direct `git push origin main` is BLOCKED by the ruleset
  (must go through a PR, and the required checks must pass)".
- **How it was found**: not by audit - by accident. A docs commit was pushed
  straight to `main` while wrapping up TD-018, expecting the ruleset to reject
  it. It succeeded, CI ran on `main` post-hoc, and the commit was already
  public before anyone noticed. Every guarantee in the branch model had been
  unenforced since the repo was bootstrapped (2026-07-24).
- **Why it matters beyond process tidiness**: the five required checks include
  `gitleaks` and `audit`. An admin push bypasses secret scanning and the SCA
  gate entirely - in a repo whose own secret-hygiene section calls
  "credentials never committed" an absolute rule precisely because the repo is
  public with no private fallback. The protection people were relying on to
  make that rule enforceable was not running.
- **Fix (2026-07-28)**: `bypass_actors` set to `[]` in the authoritative file
  and applied to the live ruleset. Break-glass is still possible - an admin
  can edit or disable the ruleset - but that is a recorded configuration
  change with a timestamp and an actor, rather than an invisible per-push
  exemption that leaves no trace distinguishing "reviewed and merged" from
  "pushed around the rules". `CLAUDE.md` now states the constraint explicitly
  so the bypass is not quietly reintroduced to make an urgent merge easier.
- **Org-wide exposure, reported not silently fixed**: the same
  `RepositoryRole 5 / always` bypass is present on `vxture-platform`,
  `vxture-karda`, `vxture-arda` and `vxture-template`. Those are outside this
  repo's write-scope, so they are reported to the platform line rather than
  changed unilaterally - but until each is fixed, none of those repos' branch
  protection is actually enforced either, and the reference
  `main-ruleset.json` those repos were bootstrapped from carries the defect,
  so any new repo inherits it.

### TD-016 - progress note (2026-07-28)

- **Shipped**: `service/src/platform/platform-entitlement.client.ts` reads
  `PLATFORM_API_URL` + `PLATFORM_INTERNAL_AUTH_TOKEN` (owner-transported
  2026-07-28) and calls C2
  `GET /platform/entitlements?workspace_id=&product=atlas` with the
  `x-vxture-internal-auth` header - the same shared-secret path arda uses in
  production. The T1 alternative was rejected for now: it gates on a published
  `atlas` plan_version, which the platform says is still an unpublished draft,
  so it would fail for every workspace (`vxture-atlas`#66).
- **Three outcomes, deliberately not collapsed into a nullable return**:
  `resolved` / `unreachable` / `not-configured`. "The platform says this
  workspace has no entitlement" and "we could not ask the platform" are
  opposite facts; flattening them is precisely how TD-005's bounded fail-open
  became permanent and invisible.
- **The gate can now say no**: a resolved view whose pools are all exhausted
  raises `403 QUOTA_EXCEEDED`. That is the first real denial this service has
  ever been able to issue.
- **Deliberately still permissive** when the view resolves with *no* coverage
  (`quota_pools: []`). Atlas's plan catalog is an unpublished draft, so every
  workspace legitimately reads as uncovered today - denying on that would take
  down live traffic (karda's included) over a platform-side bookkeeping gap,
  not an entitlement decision. This flips to a denial the moment a real
  plan_version is published; no Atlas change needed.
- **Cached** 30s per workspace (`PLATFORM_ENTITLEMENT_CACHE_TTL_MS`), because
  this sits on the hot path of every inference call. Only `resolved` outcomes
  are cached - an `unreachable` verdict must not pin degradation for a full
  TTL after the platform recovers.
- **Not closed**: the `limits`/`tier` axes of the envelope are still unused,
  and the legacy `TenantSubscriptionQuotaRecord` path below it remains the
  no-op stub from TD-005. Closing that is the same work as TD-017 part 2 (the
  C3 consume caller), which shares this client's credential and base URL.

### TD-017 part 2 - progress note (2026-07-28, closed)

- **Shipped**: `PlatformEntitlementClient.consume()` calls C3
  `POST /usage/consume {workspace_id, product, metric, amount,
  idempotency_key}` - the platform's **sole** sanctioned write path into the
  metering kernel (`data_commerce_200_metering.md` §11 forbids products
  writing the usage tables directly). Wired into the chat path after a
  successful generation.
- **Called after the fact, deliberately**: the amount is the *realized* token
  count, which does not exist before the provider responds. Gating already
  happened on the C2 read (cheap, cached), so this call is the accounting
  write, not a second gate.
- **`idempotency_key` = `requestId`**, so a retry cannot double-charge - the
  platform keys `usage_idempotencies` on exactly this.
- **Never fails the request**: every consume failure - transport error,
  non-2xx, even a `409 gated` - returns `false` and is logged. Refusing to
  return a response we have *already produced and paid for upstream* would
  waste the spend without recovering anything. The honest record is that it
  ran and was not billed.
- **Reconciliation signal changed from the original design**: the C3 response
  body (`ConsumeResponseBody` in `@vxture/shared`) carries `gated`,
  `consumed`, `remaining_total` and `per_pool_breakdown` - but **no event
  id**. So `reqlog.usage_event_id` cannot be populated as
  `docs/30-design/210-usage-metering-and-history.md` §4 originally assumed.
  Correlation is instead via `request_id`, which both sides record, and the
  "served but not billed" signal is `billed_amount IS NULL`. Reported to the
  platform line - returning the event id would let the direct reference work
  as designed.
- **Descriptor corrected alongside**: `atlas.chat` metering was declared
  `mode: "per_call"`, which is commercially wrong for an LLM gateway (a
  100k-token completion and a 100-token one are not one unit). Changed to
  `per_unit`, matching what the consume call actually sends as `amount`. The
  advertised metering and the billed amount must not drift apart.
- **Not billed yet in practice**: atlas's plan catalog is an unpublished draft
  on the platform side, so `product_metrics` for `atlas.chat` likely does not
  resolve and consume will return non-2xx. That is expected and handled - the
  requests are recorded locally with `billed_amount` NULL, so nothing is lost
  and the gap is measurable the moment the catalog is published.
- **A1/A3 not wired**: Zhipu reports no token counts for embedding/rerank, so
  there is no realized amount to consume. Deferred rather than billing a
  fabricated number.

### TD-002/TD-005 - progress note (2026-07-28, both closed)

- **TD-002 was already done, just not recorded**: its title ("usage-metering
  write path is a no-op") is literally what TD-017 fixed. Recording the
  closure here rather than leaving two open entries pointing at one already-
  finished piece of work.
- **TD-005's remaining piece turned out to be dead code, not unfinished
  code.** `QuotaService` used to carry a second quota system alongside the
  new C2 pool check (TD-016): `findCurrentSubscriptionQuota` /
  `findUsageSummary` fed a `checkCommerceQuota`/`isModelAllowed` path
  enforcing a per-subscription token budget and a model allowlist
  (`TenantSubscriptionQuotaRecord.allowedModels`/`allowCustomModel`). Both
  repository methods were stubs left over from the physical DB split that
  always returned null (their backing tables never existed in Atlas's own
  database - they were cross-database reads into commerce tables the
  platform owns) - so this entire path was unreachable on every single call
  and always fell through to fail-open, silently, since the day it was
  written.
- **It was not fixable, not just unfixed**: `allowedModels`/`allowCustomModel`
  models a v1 "capabilities" concept the platform's own
  `entitlement-view.ts` says is retired ("union/tiered strategy keys ... no
  longer leave the platform - tier→feature mapping lives in each product's
  own versioned capability matrix"). There is no data left on the platform
  side that could ever populate it. Kept as "open, blocked" it would have
  stayed open forever with no path to closing it as originally scoped.
  Removed instead, with the reasoning kept in `quota.service.ts`'s doc
  comment so a future reader doesn't wonder why model-allowlist enforcement
  is missing.
- **One real operator-facing bug found and fixed alongside**:
  `/capability/quotas` (`ModelAdminService.listTenantQuotas`) read from the
  exact same dead stub and had been silently returning `[]` to every
  operator query - indistinguishable from "no tenant has a quota" when the
  true answer was "this was never wired". Checked directly against
  `platform-entitlements.router.ts`: the platform exposes only
  `GET /platform/entitlements?workspace_id=` (single workspace), no bulk/list
  endpoint, so there is no way to answer "every tenant's quota" today - not a
  gap Atlas can close unilaterally. Changed to an explicit `501
  MODEL_ADMIN_NOT_IMPLEMENTED` (owner decision 2026-07-28: honest failure
  over a silently-empty success) rather than leaving the misleading `[]`.
  `listSubscriptionQuotas`/`listUsageSummaries` stay as documented
  permanently-empty stubs - both answer "every tenant", which has no
  possible backing from either side.
- **Net simplification**: `QuotaService.assertAllowed` is now grant check +
  C2 pool check, full stop - down from four repository calls and a private
  model-allowlist method, all but two of which could never execute. `void`
  return (nothing ever read the old `QuotaContext`/`remaining` output).
  `QuotaCheckResult`/`TenantSubscriptionQuotaRecord`'s two dead consumers and
  one dead mapper function removed with it.

### TD-015 - progress note (2026-07-28, closed)

- **Platform shipped the prerequisite same-day**: `product_210_tool-protocol.md`
  section 4.1a adds `endpoint: { method, path }` to every tool descriptor,
  paired with `deprecated` for dual-listing during a path migration
  (`platform`#173). `path` is relative to the provider's own base URL -
  deliberately not a second place a hostname lives.
- **Mirrored into Atlas**: `discovery.types.ts`'s `ToolDescriptor` gained the
  field; all four descriptors in `tool-descriptors.ts` now declare their real
  path (`atlas.chat` -> `POST /v1/chat`, etc). Test asserts every published
  descriptor carries one.
- **Closes the original incident**: a consumer polling `.well-known/vxture-tools`
  during TD-013's path retirement would have seen a byte-identical response
  and found out by 404. It would now see the path change directly.

### TD-020 - progress note (2026-07-28, atlas+platform closed)

- **Corrected by the platform line** (`vxture-atlas`#66): platform's own live
  ruleset already had `bypass_actors: []` - done directly, just undocumented
  until they found it while closing out the reference-artifact fix. Reference
  artifact + governance doc now match (`platform`#172).
- **What's actually left**: karda/arda/template only. Each is a single-repo
  write-scope boundary neither atlas nor platform can push further from here
  - tracked per-repo, owner action across three repos.
