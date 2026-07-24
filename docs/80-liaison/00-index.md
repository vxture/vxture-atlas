# 80-liaison - Cross-org liaison

Cross-organization liaison for this repo: reply letters, integration
agreements, and sync notes with other product lines or the platform line.
Artifacts are named `NN-{YYMMDDHHMM}-{slug}.md` - the stamp follows the `NN-`
index so the docs numbering guardrail still passes
(`docs/00-meta/10-docs-convention.md`).

## Outbound (drafted, not yet sent - staged pending real repo)

| Letter | Stamp | To | Subject | Status |
|--------|-------|----|---------|--------|
| `10-2607241030-atlas-reply-to-karda-capability-requirements.md` | 2607241030 | karda line | Immediate answers to the two items karda asked for before finalizing its own design: G1 (429 rate-limit vs quota-exhaustion - decided now, contract shape final) and A3.3 (rerank latency - honestly deferred, no number promised until real benchmark; commits to proactively reporting once measured) | Draft only - send once this repo has a real GitHub remote |

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
