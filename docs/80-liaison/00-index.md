# 80-liaison - Cross-org liaison

**Liaison goes through GitHub Issues, not files here** (2026-07-27,
`140-repo-governance-standard.md` sec.10). Open the issue in the repo that has
to act, not the one that originated the ask - karda asking Atlas to change an
endpoint opens it in `vxture-atlas`. Label it `liaison`. Cross-repo references
use native `org/repo#N`.

Issue state is the source of truth; this file does not mirror it. Current open
threads are listed in `docs/60-operations/10-tech-debt.md` under the entry each
one blocks.

## Archived letters

The `NN-{YYMMDDHHMM}-{slug}.md` files here are the outbound record from before
the channel change. They are kept verbatim as history - not migrated, not
edited, not added to.

| Letter | To | Subject | State |
|--------|----|---------|-------|
| `10-2607241030-atlas-reply-to-karda-capability-requirements.md` | karda line | Answers on the G1 error split, A2.3 deployment affinity, A3.3 rerank latency (deferred to a real benchmark), plus tenant-filtered model list and `taskProfile` routing | Sent, `vxture-karda`#70 |
| `20-2607261200-atlas-provider-key-ui-handoff.md` | platform line | Provider-key vault has no admin/console UI or BFF coverage | Draft only - superseded by TD-007 / `platform`#148 |
| `30-2607271000-atlas-platform-integration-readiness.md` | platform line | Consolidated status: what platform can consume now, what remains blocked on platform | Draft only - the infra-registry item was resolved; the rest is TD-004 / TD-016 |

## Inbound

Inbound letters live in the sending repo - one subject, one master copy. Only
the receipt is recorded here.

| Letter | From | Subject | Local follow-up |
|--------|------|---------|-----------------|
| `vxture-karda/docs/80-liaison/100-2607240931-karda-atlas-capability-requirements.md` | karda line | Field-level requirements for A1 embedding / A2 parse / A3 rerank; priority A1 > A3 > A2 | Design input for `docs/30-design/200-s2s-provider-surface.md`; open provider work is TD-003 |
| `vxture-karda/docs/80-liaison/70-2607232158-karda-atlas-contract-request.md` | karda line | Earlier model-call contract request, addressed before Atlas was an independent repo | Superseded by the above |
| `vxture-platform` product_210 v1.1 §11 + `41-atlas-integration-topology.md` §7 | platform line | Cross-repo fact-sync governance, authoring division, and a 7-item self-check for any L1 provider's new or breaking S2S contract change | Applies to every change to the supplier surface |
