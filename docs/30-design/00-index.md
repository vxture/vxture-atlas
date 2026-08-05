# 30-design - Architecture, ADRs, domain design

Three-digit bands: `1xx` design, `2xx` contracts and schema, `3xx`
implementation. `decisions/` holds ADRs, keyed by ADR number.

| File | Covers |
|------|--------|
| [`100-model-onboarding-and-protocol-adapters.md`](./100-model-onboarding-and-protocol-adapters.md) | Onboarding a provider or model as a data operation: `protocol` as the dispatch key (closed vocabulary in code) and `config.wire` as the quirk descriptor (data, zero DDL) |
| [`200-s2s-provider-surface.md`](./200-s2s-provider-surface.md) | The A1 embed / A2 parse / A3 rerank contracts Atlas exposes as a supplier, plus tenant model lists and task-profile routing |
| [`210-usage-metering-and-history.md`](./210-usage-metering-and-history.md) | The platform `metering.*` / Atlas `reqlog.*` boundary: who stores what, how they join, retention |
| [`decisions/`](./decisions/00-index.md) | ADR register - five accepted decisions |

Not yet written here: Atlas's own data-model narrative
(`key`/`reqlog`/`routing`/`model`), still documented only in the platform repo
(`docs/design/data_model_200_schema.md` §4), and the rationale for the physical
DB separation (boundary #1, zero cross-database FK).
