# Price reference

Seed and reconciliation inputs for `model.model_price_rules`. **Neither file
here is the billing authority** - the table is (ADR-004).

| File | Origin | Edited by |
|---|---|---|
| `reference-prices.json` | Generated from LiteLLM's public table (MIT) | the generator only |
| `local-prices.json` | Hand-authored, for providers upstream does not cover | humans |

## Commands

```
node scripts/pricing/build-reference-prices.mjs            # regenerate + coverage report
node scripts/pricing/build-reference-prices.mjs --check    # fail if out of date (CI-shaped)
node scripts/pricing/build-reference-prices.mjs --from P   # read upstream from a local file
```

`--check` is deterministic: the snapshot records the upstream content hash, not
a generation timestamp, so regenerating an unchanged upstream is a no-op diff.

## Units

Upstream is USD per single token. Atlas's `model_price_rules` is a price per
`unit_tokens` (default 1,000,000), so the generator multiplies by 1e6 and rounds
to the column's `numeric(18,8)`.

Currency stays **USD**. The DDL's `CNY` default is a column default, not an
assertion about the row, and picking an FX rate is a business decision that does
not belong in a build script.

`cacheReadUnitPrice`, `maxInputTokens` and `maxOutputTokens` are carried for
review but have **no column** in `model_price_rules` today.

## Upstream coverage is uneven - this is the main thing to know

Measured 2026-08-01 (regenerate to refresh):

| Upstream provider | Atlas provider | Priced |
|---|---|---|
| anthropic | claude | 24/24 |
| deepseek | deepseek | 12/12 |
| moonshot | moonshot | 22/22 |
| xai | xai | 40/40 |
| mistral | mistral | 54/58 |
| dashscope | qwen | 18/36 |
| openai | openai | 145/219 |
| **volcengine** | **doubao** | **0/12** |
| **ollama** | **private** | **0/29** |
| **(absent)** | **zhipu** | **none** |

Two of Atlas's four current providers - Doubao and Zhipu - get nothing usable
from upstream. Doubao's 12 rows exist but carry zero prices; Zhipu has no
first-party rows at all (GLM appears only under resellers, whose prices are
their own). Those must be authored in `local-prices.json` from the vendor's own
pricing console.

The generator deliberately keeps zero-priced providers in its map so the
coverage report says `NO PRICES UPSTREAM` out loud, rather than silently
omitting them and reading as full coverage.

An unpriced upstream row is never emitted as a zero-price entry: a rule that
charges nothing is indistinguishable from a rule that works.
