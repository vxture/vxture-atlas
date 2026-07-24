# 20-specs - Product/business specifications

Empty as of this scaffold. Atlas's product definition (the S2S provider
surface's actual contract shape for embedding/parse/rerank, model version
pinning policy, quota/rate-limit semantics) is designed here, informed by the
karda requirements letter recorded in `docs/80-liaison/00-index.md`.

The existing NestJS implementation (migrated in via Phase 4 of the repo-split
plan) already carries a de facto spec for the generation call type
(`ChatRequest`) - see `docs/40-implementation/00-index.md` once the source
lands.
