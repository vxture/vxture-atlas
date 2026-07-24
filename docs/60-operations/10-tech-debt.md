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
| TD-001 | Deploy host unassigned; beta tier dormant | 2026-07-24 | open - awaiting owner host assignment |
| TD-002 | Usage-metering write path is a no-op, inherited from the in-monorepo implementation | 2026-07-24 | open - blocks C3 consume wiring (Phase 3) |
| TD-003 | S2S provider surface (embedding/parse/rerank) not designed; karda has submitted field-level requirements as design input | 2026-07-24 | open - v0.1 design drafted (`docs/30-design/200-s2s-provider-surface.md`); rerank latency (A3.3) and parse deployment affinity (A2.3) still need real benchmarking/host assignment before final |
| TD-004 | BFF-to-service auth is currently unauthenticated (plain fetch, diagnostics-only guard) | 2026-07-24 | open - needs S2S token exchange before cross-repo network exposure (Phase 5) |

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
