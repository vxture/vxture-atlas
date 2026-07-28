# 80-liaison - Cross-org liaison (archived channel, see below)

**Channel change (2026-07-27, `140-repo-governance-standard.md` sec.10)**:
cross-repo liaison (reply letters, integration agreements, sync notes) now
goes through **GitHub Issues**, not new files here. Two real incidents drove
this - a letter sent to the wrong repo with no lightweight correction path,
and a drafted-but-unsent letter with no enforced state, so the other side
acted on stale assumptions. Issues fix both: wrong-repo mistakes are fixed
with a native `transfer`, and there is no "drafted but not sent" limbo - open
means sent.

**Where to open the issue**: in the repo that has to act/respond, not the
repo that originated the ask - e.g. karda asking Atlas to change an endpoint
opens the issue in `vxture-atlas`, not `vxture-karda`. Tag it `liaison`
(distinct from this repo's bug/feature issues). Cross-repo references use
native `org/repo#N` syntax - no more file-number addressing.

This directory's existing `NN-{YYMMDDHHMM}-{slug}.md` files stay as archived
history - not migrated, not deleted, just no longer added to. The docs
numbering guardrail (`docs/00-meta/10-docs-convention.md`) still applies to
whatever already exists here.

## GitHub-Issues era (2026-07-27 onward) - live index, not archived

The actual liaison threads now live as GitHub Issues (`liaison` label,
opened in whichever repo has to act). This table is a pointer index only -
issue state is the source of truth, not this row.

| Issue | Repo | Subject | Status |
|---|---|---|---|
| [#34](https://github.com/vxture/vxture-atlas/issues/34) | atlas | Reply to karda's letter 140 | Closed - sent as `karda`#70 |
| [#35](https://github.com/vxture/vxture-atlas/issues/35) | atlas | A2.3 deployment affinity conclusion | Closed - same host (worker-02) |
| [#36](https://github.com/vxture/vxture-atlas/issues/36) | atlas | A3.3 rerank P95 benchmark | Open - blocked on #39 (no real rerank provider yet) |
| [#37](https://github.com/vxture/vxture-atlas/issues/37) | atlas | A1 real embedding provider | Open - product/cost decision |
| [#38](https://github.com/vxture/vxture-atlas/issues/38) | atlas | A2 real parse provider | Open - product/cost decision |
| [#39](https://github.com/vxture/vxture-atlas/issues/39) | atlas | A3 real rerank provider | Open - product/cost decision |
| [#40](https://github.com/vxture/vxture-atlas/issues/40) | atlas | `/model-platform/chat` -> `/v1/chat` rename | Open - blocked on `platform`#144 |
| [#52](https://github.com/vxture/vxture-atlas/issues/52) | atlas | M-1 operator-token verification on admin routes (mgmt-plane contract batch B) | Open - platform half landed, atlas half not started |
| [#60](https://github.com/vxture/vxture-atlas/pull/60) | atlas | `model-platform` route-prefix cleanup (TD-013): admin -> `/capability`, health dedup | Open PR - see `platform`#144/#148 comments for cross-repo follow-ups |
| [#41](https://github.com/vxture/vxture-atlas/issues/41) | atlas | Tenant-scoped model list | Closed - shipped, deployed, confirmed live |
| [#42](https://github.com/vxture/vxture-atlas/issues/42) | atlas | taskProfile routing | Closed - shipped, deployed, confirmed live |
| [#43](https://github.com/vxture/vxture-atlas/issues/43) | atlas | Capability discovery endpoint | Closed - shipped (TD-008) |
| [#47](https://github.com/vxture/vxture-atlas/issues/47) | atlas | karda's real end-to-end integration test | Closed - full chain proven live (TD-010/011/012) |
| [#144](https://github.com/vxture/vxture-platform/issues/144) | platform | `model-runtime-client` coordination for #40 | Open - parked, no action needed yet |
| [#145](https://github.com/vxture/vxture-platform/issues/145) | platform | Confirm Atlas production registration | Closed |
| [#147](https://github.com/vxture/vxture-platform/issues/147) | platform | (karda-side coverage gap, closed by karda) | Closed |
| [#148](https://github.com/vxture/vxture-platform/issues/148) | platform | Atlas admin-UI gaps + admin-surface architecture discussion | Open - `product_250_management-plane-contract.md` v0.1 draft in review, Batch A/B not yet landed |
| [#152](https://github.com/vxture/vxture-platform/issues/152) | platform | `modelCode` provider-prefix breaks real upstream calls | Open - options laid out, not yet decided |
| [karda#70](https://github.com/vxture/vxture-karda/issues/70) | karda | Atlas's reply to letter 140 | Closed |
| [karda#72](https://github.com/vxture/vxture-karda/issues/72) | karda | Model-selection UX direction confirmation | Closed - both modes, phased, taskProfile first |
| [karda#76](https://github.com/vxture/vxture-karda/issues/76) | karda | karda.ask host cutover tracking | Closed - real generation confirmed, cutover proceeding |

## Outbound (historical - see channel-change note above; no longer added to)

| Letter | Stamp | To | Subject | Status |
|--------|-------|----|---------|--------|
| `10-2607241030-atlas-reply-to-karda-capability-requirements.md` | 2607241030 (updated 2607271000ish) | karda line | Immediate answers to the items karda asked for before finalizing its own design: G1 (429 rate-limit vs quota-exhaustion - decided, contract shape final), A2.3 (parse deployment affinity - now resolved: same host worker-02, feasible), A3.3 (rerank latency - honestly deferred, no number promised until real benchmark), a 2026-07-27 auth-status correction (T1/T2 token-exchange mechanism has been live since 2026-07-12 - karda's "is it implemented" premise was stale; what's actually still open is whether Atlas's own `product.products` registration has been run in production, a platform-line execution item, not a missing mechanism), plus two newly-landed capabilities karda had asked for: tenant-filtered `GET /model-platform/models?tenantId=...` (model-selector prerequisite) and `taskProfile` routing on all four A1-A4 endpoints (karda.ask auto-adaptation prerequisite) | **Sent 2026-07-27** - https://github.com/vxture/vxture-karda/issues/70 (human-confirmed before sending) |
| `20-2607261200-atlas-provider-key-ui-handoff.md` | 2607261200 | platform line (admin-bff/console-bff/portals maintainers) | `model-platform/admin/provider-keys*` (TD-006) has no admin/console UI or BFF coverage, unlike every other model-platform resource - requests platform side add it following the existing providers pattern | Draft only - recorded as TD-007 |
| `30-2607271000-atlas-platform-integration-readiness.md` | 2607271000 | platform line (admin-bff/console-bff/auth-bff/ops) | Consolidated status: what's ready to consume now (S2sAuthGuard-protected routes, provisioning webhook, admin API), and what's still blocked on platform (product.agent_catalog for TD-002/005, S2S token-exchange + BFF/varda caller wiring for TD-004, infra-allocation-registry sync + deploy secrets/Environment for TD-001/Phase 6) | Draft only - the infra-allocation-registry item was addressed by the platform line (see Received below, 2026-07-27); the rest is still open |

## Received

Inbound letters live in the sending repo; we record receipt and the local
follow-up here rather than copying them (one subject, one master copy).

| Letter | Stamp | From | Subject | Local follow-up |
|--------|-------|------|---------|-----------------|
| `vxture-karda/docs/80-liaison/70-2607232158-karda-atlas-contract-request.md` | 2607232158 | karda line (addressed to "atlas line" before Atlas was independent) | model-call interface contract request: embedding / parsing models / rerank / generation, plus a deployment-affinity ask for the parsing type | answered by the platform line (`90` below) while Atlas was still in-monorepo; superseded once Atlas designs its own contract (Phase 3) |
| `vxture-karda/docs/80-liaison/100-2607240931-karda-atlas-capability-requirements.md` | 2607240931 | karda line | field-level requirements for A1 embedding / A2 parsing models / A3 rerank, as design input while Atlas builds them - hard constraints: batch API + pinned/enumerable model version + stable vector dimension for embedding; batch API + explicit deployment-affinity feasibility answer for parsing; <=100 candidates at P95 <400ms + fast-fail degradation signal for rerank; 429 that distinguishes rate-limit from quota-exhaustion; service-mode credential with metering attributed to the calling workspace, not the caller's identity. Priority order A1 > A3 > A2 | **TD-003** (`docs/60-operations/10-tech-debt.md`) - fold into the Phase 3 S2S provider surface design before finalizing endpoint shapes; karda asks for a feasibility answer on A3's latency budget and A1's version-pinning approach before Atlas's design is final, to avoid rework on both sides |

Also relevant (recorded by the platform line, not addressed to Atlas
directly): `vxture-platform/docs/80-liaison/90-2607240921-karda-atlas-reply-received.md`
confirms Atlas's non-independence status as of that date and that only
generation (A4) was implemented in the in-monorepo service - this repo-split
is the direct response to that gap.

| Letter/change | Stamp | From | Subject | Local follow-up |
|--------|-------|------|---------|-----------------|
| `vxture-platform/docs/30-design/platform/41-atlas-integration-topology.md` §7 + `docs/30-design/product_210_tool-protocol.md` v1.1 §11 + `docs/50-deployment/13-infra-allocation-registry.md` atlas row | 2607271000ish | platform line | Cross-repo fact-sync governance (registry is the single authority for steady-state facts, not liaison letters); authoring-division table (endpoint contracts = Atlas's own, auth envelope/unified invariants = platform's, capability discovery reuses existing `.well-known/vxture-tools` mechanism); a mandatory 7-item self-check checklist for any L1 provider's new/breaking S2S contract change; infra-allocation-registry atlas row backfilled to reflect the real 2026-07-27 deploy | Verified directly in the platform repo 2026-07-27. TD-001 closed for the deploy-registry item; TD-003 gets the new self-check obligation; new **TD-008** opened for the capability-discovery endpoint gap (`GET /.well-known/vxture-tools` not implemented in Atlas yet) |
