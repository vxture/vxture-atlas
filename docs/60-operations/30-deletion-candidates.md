# Deletion candidates (working inventory)

Numbered because the docs guardrail requires it (`--strict` rejects unnumbered
files in this repo). It is still a temporary working file. It is a
list of candidates. Each entry needs a verdict (delete / keep / fix-instead)
before anything moves; a `[DELETED]` / `[FIXED]` marker means it has had one.

Opened 2026-08-06. Delete this file once every entry has a verdict.

**Only A3 is still open.** A1, A2, B1, B2 are resolved; section C was never a
candidate. A3 needs installing ESLint rather than deleting a lint config, which
is a change in its own right, not a cleanup.

## Method, and what it cannot see

Static reference analysis over the 66 non-spec TypeScript files (~11k LOC) in
`service/src`, plus the config and script surface. For each exported symbol:
count references outside its defining file, then separately count references
inside it, so "nobody imports it" is distinguished from "it is internal
plumbing that did not need the `export` keyword".

Two blind spots, stated so nobody reads this list as exhaustive:

- **Reference by name, not by resolution.** A symbol whose name collides with an
  unrelated identifier elsewhere reads as used. Errs toward keeping code.
- **No dynamic reachability.** Nest resolves providers through the DI container,
  and `apiKeyEnvVar` values name environment variables from database rows. A
  string in the database can keep code alive that looks orphaned here.

Neither blind spot can produce a false "delete this" for the entries in section
A, which were each confirmed by reading the file.

## Headline

The service source is close to clean: exactly **one** truly unreferenced symbol,
and **zero** orphaned modules. The accumulated dead weight is not in the service
logic - it is in the build/config/meta layer, and all of it is residue from the
extraction out of `vxture-platform`'s monorepo.

## A. Confirmed dead

A1 and A2 are **deleted by the same PR that adds this file** - the inventory is
the analysis, the deletion is its first action. They are kept here (rather than
removed once done) so the reasoning survives the entries, and because A3 in the
same section is still open.

### A1. `service/src/index.ts` - the barrel nobody imports  [DELETED 2026-08-06]

A 23-line barrel re-exporting the module surface. **Zero importers** anywhere in
the repo. It survives only because `service/package.json` declares
`"main": "src/index.ts"` and `"types": "src/index.ts"`.

Both are leftovers from when this code was `@vxture/service-model-platform`, a
workspace *library* consumed by sibling packages inside the platform monorepo.
Atlas is now a standalone deployable service: the build entry is `src/main.ts`
(esbuild, per the `build` script), and nothing imports `@atlas/service`.

Corroborating evidence that it is unmaintained rather than merely unused: the
barrel is *incomplete*. It omits embedding, rerank, parse, tenancy,
provisioning and provider-keys entirely - every module added after the
extraction.

**Done**: `src/index.ts` deleted; `main` and `types` dropped from
`service/package.json` (the package is `private: true` and was never resolved as
a library).

### A2. `isModelProtocol` - `service/src/providers/protocol.ts`  [DELETED 2026-08-06]

The only exported symbol in the entire service with no reference anywhere,
including its own file and the specs. A type guard that nothing guards.

**Done**: deleted. `MODEL_PROTOCOLS`, the array it read, stays - it is still the
closed vocabulary `model-admin.service.ts` validates `protocol` against.

### A3. The `lint` scripts point at an ESLint that is not installed

`service/package.json` declares `lint` and `lint:fix` running `eslint src`, and
`service/eslint.config.mjs` exists - but **eslint is not in `devDependencies`**
and is not installed. Root `package.json`'s `lint` recurses into it
(`pnpm --recursive --if-present lint`), so `pnpm lint` fails today at the root.

CI never runs it. `quality-gate` aggregates the whitespace/docs-numbering/
data-architecture/workflow guardrails; `build` is type-check plus the esbuild
bundle; `test-coverage` is vitest. No job invokes `lint`.

**This one should not be resolved by deleting.** Deleting the scripts and the
config removes a standard rather than a redundancy, and the config file is
evidence that linting was intended. The end state that is actually sound is:
add `eslint` to `devDependencies` and wire it into `quality-gate`. Listed here
because the *current* state is dead either way - a lint that cannot run is not
a lint.

## B. Unwired - needs a verdict, not obviously dead

### B1. `scripts/pricing/*`  [DELETED 2026-08-06]

`build-reference-prices.mjs`, `reference-prices.json`, `local-prices.json`,
`README.md`. Reference analysis shows a **closed island**: these four files
reference each other and nothing else in the repo references any of them. No
npm script, no workflow, no service code, no doc outside the island's own
README.

That is consistent with two very different situations: a genuinely abandoned
one-off, or a manual operator tool for authoring `model_price_rules` that is
*supposed* to be run by hand. The reference graph cannot tell them apart.

**Verdict (owner, 2026-08-06)**: no manual-ops path was ever designed - price
rules are maintained through the operator platform, and `/capability/price-rules`
already serves that end to end. Nothing referenced these files from any
interface. Deleted.

**But the deletion could not be clean.** The island's README was the *only*
place several load-bearing facts were written down, none of which appeared in
any interface document:

- `unit_tokens` is a quote basis (per million), not a cap
- **currency is USD by convention**, while the DDL column defaults to `CNY` -
  a reader of the schema or the API would infer the opposite
- vendor tables quote USD per single token; converting is `x 1e6`
- cache-read price and per-model input/output caps have **no column**
- upstream price coverage is uneven: doubao 0/12, private 0/29, zhipu none

So the files went only after the knowledge moved:
`docs/20-specs/10-http-surface.md` gained a price-rule unit-semantics section
(it is interface contract - whoever authors a rule reads it there), and
`docs/30-design/100-model-onboarding-and-protocol-adapters.md` section 9 gained
the coverage table (it is an onboarding step - "this provider's price must be
read off the vendor console").

The README also cited ADR-004 as the authority for "the table is the billing
authority". ADR-004 rejects the Portkey Gateway dependency and says nothing of
the sort; the misreference left with the file. The two remaining ADR-004
citations (`scripts/dev/s2s-smoke.mjs`, `service/src/providers/sse.ts`) were
checked and are correct.

### B2. `MODEL_PLATFORM_PORT` - `service/src/main.ts:21`  [FIXED 2026-08-06]

```ts
const port = Number(process.env.MODEL_PLATFORM_PORT ?? 3100);
```

Carries the pre-rename `model-platform` name (retired by TD-013) and is set
**nowhere** - not in `docker-compose.yml`, not in `.env.example`, not in any
workflow. Production therefore runs on the hardcoded `3100` default.

**It was worse than a stale name - both halves were disconnected.**
`docker-compose.yml:50` sets `PORT: "3100"`, which the code never read; the code
read `MODEL_PLATFORM_PORT`, which nothing set. They agreed only because both
hardcode 3100.

That is a latent deploy failure, not a cosmetic issue. Changing compose's `PORT`
to move the service would leave the app listening on 3100 while the publish
mapping pointed at the new port - and the container healthcheck probes
`127.0.0.1:3100/healthz` from *inside* the container, so it would stay green
while the service was unreachable from outside.

**Done**: `main.ts` reads `PORT`, the variable compose already sets.
`MODEL_PLATFORM_PORT` is gone. Renaming it to `ATLAS_PORT` would only have moved
the disconnect.

Note: `MODEL_PLATFORM_SECRET_KEY` and `MODEL_PLATFORM_TEST_KEY` also appear with
the old name, but only as **spec fixture strings** - they are test data, not
configuration. No action.

## C. Explicitly NOT candidates

Recorded so a later pass does not re-propose them.

### C1. The 37 over-exported symbols

Symbols exported but referenced only inside their own file - e.g.
`WireSupports` (9 internal uses), `ModelProbeCheck` (6), `EntitlementOutcome`
(5). Dropping `export` from each is a 20-file diff that changes no behaviour,
removes no code, and would collide with anything in flight.

Several are also legitimately part of a module's public type surface even though
nothing imports them *today* - `ModelAdminErrorResponse` and
`ProviderKeyErrorResponse` describe response shapes that callers will want.

**Verdict: leave alone.** This is churn, not cleanup.

### C2. The `501 MODEL_NOT_IMPLEMENTED` stubs

`base.provider.ts`'s default `embed` / `rerank` / `parseDocument`. These are the
contract layer standing without a capability behind it, which is a recorded
decision ([ADR-002](../30-design/decisions/ADR-002-s2s-provider-surface-contract-layer-only.md))
and the honest current state of TD-003 / issues #37 #38 #39. Deleting them
would delete the contract.

### C3. Secrets absent from the repo

`PROVIDER_KEY_ENCRYPTION_KEYS`, `PROVIDER_KEY_ENCRYPTION_ACTIVE_KEY_ID`,
`INTERNAL_DIAGNOSTICS_TOKEN` are read by code and appear in no repo file. That
is the design, not an omission: per ADR-003 they live in a separate,
non-CI-bootstrapped env file on the host with tighter permissions. Credentials
never enter the repo.

### C4. `scripts/dev/s2s-smoke.mjs`, `scripts/dev/seed-test-data.mjs`

Referenced by `docs/60-operations/20-run-local-test-env.md`. Wired and
documented. `s2s-smoke.mjs` is in fact the nearest existing asset for the
outstanding real-upstream verification that #37 / #39 / #36 are waiting on.

## Not covered by this pass

- `docs/` - 28 files, all numbered, none flagged by the taxonomy guardrail. No
  superseded-document analysis was done; that needs reading content, not
  references.
- `deploy/database/ddl/` - deliberately excluded. DDL is append-only governance
  (three-part + `incr/`), and "unreferenced" is meaningless there.
- The `provider_code` fallback dispatch layer, whose removal is already
  scheduled as P3 in `docs/70-workplan/00-index.md`. Tracked, not a discovery.
