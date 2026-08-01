#!/usr/bin/env node
/**
 * build-reference-prices.mjs - regenerate scripts/pricing/reference-prices.json
 * from LiteLLM's public price table.
 *
 * Why a snapshot and not a runtime dependency: `model.model_price_rules` is the
 * authority for what Atlas charges (ADR-004). Upstream is a *seed and
 * reconciliation reference* only - it is another project's data, on another
 * project's release cadence, and pulling 1.6MB of it at request time would put
 * a third party in the billing path. So it is vendored, reviewed in a PR like
 * any other change, and diffed on demand.
 *
 * Upstream coverage is uneven and that unevenness is the point of the coverage
 * report this prints. Measured 2026-08-01: anthropic 24/24 priced, deepseek
 * 12/12, moonshot 22/22, dashscope 18/36, openai 145/219 - but volcengine
 * (Doubao) has 12 entries with zero/absent prices, ollama is unpriced by
 * definition, and Zhipu has no first-party entries at all. Two of Atlas's four
 * current providers are therefore NOT covered here and must be maintained by
 * hand in `local-prices.json`.
 *
 * Unit conversion: upstream is USD per single token; Atlas's
 * `model_price_rules` is a price per `unit_tokens` (default 1,000,000). Currency
 * is kept as USD - the DDL default of CNY is a column default, not an assertion,
 * and inventing an FX rate here would bury a business decision in a script.
 *
 * Modes:
 *   (default)  rewrite reference-prices.json and print the coverage report
 *   --check    do not write; exit 1 if the committed file is out of date (CI)
 *   --from P   read upstream from local path P instead of fetching
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(HERE, "reference-prices.json");

const SOURCE_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const SOURCE_LICENSE = "MIT (BerriAI/litellm, outside enterprise/)";

/** Atlas's `unit_tokens` convention for generated rules. */
const UNIT_TOKENS = 1_000_000;

/**
 * Upstream `litellm_provider` values worth carrying, mapped to the Atlas
 * `provider_code` they would seed. Providers Atlas neither runs nor plausibly
 * will are dropped - the point is a reviewable file, not a mirror.
 *
 * `volcengine` and `ollama` are listed deliberately even though upstream prices
 * them at zero: keeping them in the map is what makes the coverage report say
 * "0 priced" out loud instead of silently omitting them.
 */
const PROVIDER_MAP = {
  anthropic: "claude",
  volcengine: "doubao",
  deepseek: "deepseek",
  dashscope: "qwen",
  moonshot: "moonshot",
  openai: "openai",
  ollama: "private",
  xai: "xai",
  mistral: "mistral",
};

const STRICT_CHECK = process.argv.includes("--check");
const fromFlag = process.argv.indexOf("--from");
const FROM_PATH = fromFlag === -1 ? null : process.argv[fromFlag + 1];

async function loadUpstream() {
  if (FROM_PATH) {
    return readFileSync(FROM_PATH, "utf8");
  }
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    console.error(
      `[pricing] failed to fetch upstream: ${response.status} ${response.statusText}`,
    );
    process.exit(1);
  }
  return response.text();
}

/** USD per token -> USD per UNIT_TOKENS, rounded to the DDL's numeric(18,8). */
function toUnitPrice(costPerToken) {
  return Number((costPerToken * UNIT_TOKENS).toFixed(8));
}

function isPriced(entry) {
  return (
    Number(entry.input_cost_per_token ?? 0) > 0 ||
    Number(entry.output_cost_per_token ?? 0) > 0
  );
}

function build(rawText) {
  const upstream = JSON.parse(rawText);
  const entries = {};
  const coverage = {};

  for (const [modelKey, value] of Object.entries(upstream)) {
    if (!value || typeof value !== "object") continue;
    const upstreamProvider = value.litellm_provider;
    const providerCode = PROVIDER_MAP[upstreamProvider];
    if (!providerCode) continue;

    const bucket = (coverage[upstreamProvider] ??= {
      providerCode,
      total: 0,
      priced: 0,
    });
    bucket.total += 1;

    // An unpriced upstream row must never become a zero-price rule - a rule
    // that charges nothing is indistinguishable from a rule that works.
    if (!isPriced(value)) continue;
    bucket.priced += 1;

    const record = {
      providerCode,
      upstreamProvider,
      billingMode: "token",
      currency: "USD",
      unitTokens: UNIT_TOKENS,
      inputUnitPrice: toUnitPrice(Number(value.input_cost_per_token ?? 0)),
      outputUnitPrice: toUnitPrice(Number(value.output_cost_per_token ?? 0)),
    };

    // Reference-only fields: no `model_price_rules` column holds these today.
    // Carried because they are the reason to re-run this script - cache pricing
    // and context limits move more often than base token prices.
    if (Number(value.cache_read_input_token_cost ?? 0) > 0) {
      record.cacheReadUnitPrice = toUnitPrice(
        Number(value.cache_read_input_token_cost),
      );
    }
    if (Number.isFinite(value.max_input_tokens)) {
      record.maxInputTokens = value.max_input_tokens;
    }
    if (Number.isFinite(value.max_output_tokens)) {
      record.maxOutputTokens = value.max_output_tokens;
    }

    entries[modelKey] = record;
  }

  const sorted = Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );

  return {
    document: {
      _meta: {
        description:
          "Vendored price reference. Seed and reconciliation input for model.model_price_rules - NOT the billing authority (ADR-004).",
        generator: "scripts/pricing/build-reference-prices.mjs",
        sourceUrl: SOURCE_URL,
        sourceLicense: SOURCE_LICENSE,
        // Content hash rather than a timestamp: `--check` must be
        // deterministic, and a regenerated-but-identical file should be a
        // no-op diff.
        sourceSha256: createHash("sha256").update(rawText).digest("hex"),
        sourceEntryCount: Object.keys(upstream).length,
        unitTokens: UNIT_TOKENS,
        currency: "USD",
        note: "Prices are USD per unitTokens. cacheReadUnitPrice / maxInputTokens / maxOutputTokens have no model_price_rules column and are reference-only.",
      },
      entries: sorted,
    },
    coverage,
  };
}

function reportCoverage(coverage) {
  console.log("[pricing] upstream coverage by provider:");
  const rows = Object.entries(coverage).sort(([a], [b]) => (a < b ? -1 : 1));
  for (const [upstreamProvider, bucket] of rows) {
    const gap = bucket.priced === 0 ? "  <-- NO PRICES UPSTREAM" : "";
    console.log(
      `  ${upstreamProvider.padEnd(12)} -> ${bucket.providerCode.padEnd(10)} ` +
        `${String(bucket.priced).padStart(3)}/${String(bucket.total).padEnd(4)} priced${gap}`,
    );
  }
  const uncovered = rows.filter(([, b]) => b.priced === 0);
  if (uncovered.length > 0) {
    console.log(
      `\n[pricing] ${uncovered.length} provider(s) have no usable upstream prices. ` +
        "Their rules must be hand-maintained in scripts/pricing/local-prices.json.",
    );
  }
}

const rawText = await loadUpstream();
const { document, coverage } = build(rawText);
const serialized = `${JSON.stringify(document, null, 2)}\n`;

if (STRICT_CHECK) {
  let committed;
  try {
    committed = readFileSync(OUTPUT_PATH, "utf8");
  } catch {
    console.error(`[pricing] missing ${OUTPUT_PATH} - run without --check.`);
    process.exit(1);
  }

  if (committed !== serialized) {
    console.error(
      "[pricing] reference-prices.json is out of date with upstream.\n" +
        "          Run: node scripts/pricing/build-reference-prices.mjs\n" +
        "          Review the diff before committing - prices are money.",
    );
    process.exit(1);
  }

  console.log(
    `[pricing] OK - reference-prices.json matches upstream (${Object.keys(document.entries).length} priced entries).`,
  );
  process.exit(0);
}

writeFileSync(OUTPUT_PATH, serialized);
console.log(
  `[pricing] wrote ${Object.keys(document.entries).length} priced entries to reference-prices.json`,
);
reportCoverage(coverage);
