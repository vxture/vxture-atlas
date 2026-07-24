# 30-design - Architecture, ADRs, domain design, DB schema

Three-digit bands: `1xx` design, `2xx` contracts and schema, `3xx`
implementation. `decisions/` holds ADRs (keyed by ADR number, not sequence).

## What belongs here once written

- Atlas's own data model narrative (the `key`/`reqlog`/`routing`/`model` schema
  design is currently only documented in the platform repo,
  `docs/design/data_model_200_schema.md` section 4 - migrating that
  documentation ownership here, or at minimum cross-linking it, is open work).
- Why Atlas physically separates from the platform DB (boundary #1 - zero
  cross-database FK) - carried over rationale from the repo-split plan, not
  yet its own numbered document.
- The S2S provider surface design for embedding/parse/rerank (see
  `docs/20-specs/00-index.md` and the karda requirements letter in
  `docs/80-liaison/00-index.md` for design input).

## Written

- `200-s2s-provider-surface.md` - v0.1 design for the A1(embedding)/A2(parse)/A3(rerank) S2S
  endpoints, written directly from karda's submitted requirements
  (`docs/80-liaison/100-2607240931-...`). G1 (429 rate-limit vs quota-exhaustion) is decided;
  A3.3 (rerank latency budget) and A2.3 (parse deployment affinity) are explicitly left open
  pending real benchmarking / host assignment - see the doc's §6.

## `decisions/`

Empty - no atlas-repo decisions recorded yet. See `decisions/00-index.md`.
