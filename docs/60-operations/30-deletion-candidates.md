# Deletion candidates (working inventory)

Numbered because the docs guardrail requires it (`--strict` rejects unnumbered
files in this repo). It is still a temporary working file. It is a
list of candidates. Each entry needs a verdict (delete / keep / fix-instead)
before anything moves; entries carrying a `[DELETED]` marker have had theirs.

Opened 2026-08-06. Delete this file once every entry has a verdict.

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

### B1. `scripts/pricing/*`

`build-reference-prices.mjs`, `reference-prices.json`, `local-prices.json`,
`README.md`. Reference analysis shows a **closed island**: these four files
reference each other and nothing else in the repo references any of them. No
npm script, no workflow, no service code, no doc outside the island's own
README.

That is consistent with two very different situations: a genuinely abandoned
one-off, or a manual operator tool for authoring `model_price_rules` that is
*supposed* to be run by hand. The reference graph cannot tell them apart.

**Needs**: an owner decision. If it is an operator tool, it belongs in the
operations docs with an invocation line, not in an unreferenced corner.

### B2. `MODEL_PLATFORM_PORT` - `service/src/main.ts:21`

```ts
const port = Number(process.env.MODEL_PLATFORM_PORT ?? 3100);
```

Carries the pre-rename `model-platform` name (retired by TD-013) and is set
**nowhere** - not in `docker-compose.yml`, not in `.env.example`, not in any
workflow. Production therefore runs on the hardcoded `3100` default.

Not dead code (the fallback is load-bearing), but a stale-named knob that
nothing turns. Either rename to match the `atlas` cascade and set it in compose,
or drop the variable and keep the constant.

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
