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
| TD-001 | Deploy host unassigned; beta tier dormant | 2026-07-24 | partially closed 2026-07-24 - host owner-confirmed (worker-02); secrets/GitHub Environment/registry mirror still open |
| TD-002 | Usage-metering write path is a no-op, inherited from the in-monorepo implementation | 2026-07-24 | open - blocked on platform `product.agent_catalog` (see TD-005 progress note), not just C3 consume wiring |
| TD-003 | S2S provider surface (embedding/parse/rerank) not designed; karda has submitted field-level requirements as design input | 2026-07-24 | open - v0.1 design drafted (`docs/30-design/200-s2s-provider-surface.md`); rerank latency (A3.3) and parse deployment affinity (A2.3) still need real benchmarking/host assignment before final |
| TD-004 | BFF-to-service auth is currently unauthenticated (plain fetch, diagnostics-only guard) | 2026-07-24 | partially closed 2026-07-24 - Atlas-side S2S token verification (callee half) landed; platform-side token-exchange issuance + BFF/varda client wiring (caller half) still open |
| TD-005 | `quota.service.ts`/`metering.service.ts`/`model-registry.repository.ts` reference Prisma models removed from `prisma/schema.prisma` during the physical DB split | 2026-07-24 | crash risk closed 2026-07-24 (ghost delegates removed, fail-open in place); real C2/C3 wiring still blocked on platform `product.agent_catalog` |

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
