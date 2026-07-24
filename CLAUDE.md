# vxture-atlas Repository Standards

Authoritative working agreement for this repo. The goal is a clean, predictable
branch and deploy flow with no direct human writes to protected branches, on top
of the org governance base.

This is Atlas, Vxture's L1 model platform (unified model access, routing,
quota and metering - the sole LLM/model egress point for every other vxture
product). It was extracted from `vxture-platform`'s combined
`@vxture/service-model-platform` implementation with product code `atlas`, so
everything below the product line - governance, CI/CD, the platform
integration channels, the data layer - is inherited and rigid. Atlas is a
**services profile** repo (product_240 section 2.5), not the app profile most
other vxture products use: there is no Next.js app, no `portals/`, no
browser-facing UI. The source is a single NestJS service under `service/`.

**Package manager: pnpm** (whole-stack, owner-decided 2026-07-20). CI cache keys,
the Dockerfile deps stage, and the osv `--lockfile=pnpm-lock.yaml` path are all
pnpm.

Authority for the design lives in the platform repo (`D:\MyWebSite\vxture`), not
here: `docs/10-standards/140-repo-governance-standard.md` (WHAT),
`docs/30-design/product_240_repo-template.md` (template design, section 3
matrix defines exactly which modules apply to an L1/atlas repo - not the full
set),`docs/50-deployment/rebuild/20-self-rectify-runbook.md` (HOW + machine
checks), `docs/10-standards/070-docs-taxonomy.md` (docs numbering). When a gap
is not covered by an existing standard, fix the standard in the platform repo
first, then mirror it here - do not invent a standard inside a product repo.

## What Atlas does NOT inherit (per product_240 section 3, atlas row)

Unlike an "app profile" product (arda/karda/terra), Atlas does **not** get:
- The business-plane DB baseline (`vx_provision`/`local_authz`/`local_usage` +
  domain schemas, template section 2.4) - Atlas is not an asset-face product,
  it has its own purpose-built data model (provider/model/grant/price_rule/
  policy + key/reqlog/routing) in its own physical database
  `vxturestudio_modelruntime_main`, zero cross-database FK to the platform DB.
- `portals/` or any app-profile scaffolding.
- C3 `grant.invalidated` or the visible-set recall filter (atlas is not an
  asset-face product in the sharing-grant sense).
- An `agent-server/` slot.

What it DOES carry: the full governance base, OIDC RP five endpoints (present
but currently unused - Atlas has no end-user browser surface; the operator
UI lives in `vxture-platform`'s admin/console portals, calling Atlas over the
network), C2 entitlement client, C3 provisioning webhook, **C3 consume as the
sole inference-metering entry point for every other vxture product** (karda,
arda, varda, etc. token usage all flows through Atlas's consume path, not
their own), and the S2S surface both as a provider (embedding/parse/rerank/
generation endpoints for other products to call) and as a caller (outbound to
upstream model providers - Doubao/Claude/OpenAI/private).

## Name cascade (product code `atlas`)

OIDC client pair `atlas` / `atlas-beta`; compose project and container prefix
`atlas-app` / `atlas-db`; image name `atlas-app`; database
`vxturestudio_modelruntime_main` with service role `atlas_svc`; secrets
`ATLAS_DB_SVC_PASSWORD`, `ATLAS_PROVISION_WEBHOOK_SECRET`,
`ATLAS_WEBHOOK_BASE_URL`; public host `atlas.vxture.com` (reserved, not yet
bound - Atlas is tailnet-only today, see docs/50-deployment/00-index.md).

## Build status

Extracted from vxture-platform (2026-07-24): the governance shell is
scaffolded here; the actual `service/` source (the current
`@vxture/service-model-platform` NestJS implementation) is migrated separately
via `git filter-repo` to preserve history, not copied in with this scaffold -
see `docs/70-workplan/00-index.md`.

Not yet done: GitHub bootstrap, platform-side registration completion (host/
worker allocation is still unassigned per the platform's infra-allocation
registry), the data-layer migration (`model.*` tables + `key`/`reqlog`/
`routing` into this repo's own DDL), the C2/C3 contract wiring to replace the
direct cross-schema Prisma reads the in-monorepo service currently does, and
the entire S2S provider surface (embedding/parse/rerank) that karda has
already submitted requirements for (`docs/80-liaison/00-index.md`).

## Branch model

Single long-lived branch: `main` (trunk-based). Deploys are NOT tied to merges -
they are triggered only by pushing a release tag, which also selects the
environment (product repos default to two tiers):

- `main` - the only integration branch. All feature work merges here via PR.
  Merging to `main` does NOT deploy anything by itself.
- `beta-YYYYMMDD.N` tag - deploys the beta stack. No approval gate.
- `vX.Y.Z` tag - deploys the production stack. Gated by a required reviewer on
  the `production` GitHub Environment - the deploy job pauses until approved.

`dev-*` and `varda-*` tags are platform-repo-only; product repos do not build
develop/varda environments.

Always branch off `origin/main`, never off a stale local branch.

## How to make a change (the only path)

1. `git fetch origin && git switch -c <feature> origin/main`
2. Commit work on the feature branch.
3. Open a PR into `main`. Direct `git push origin main` is BLOCKED by the ruleset
   (must go through a PR, and the required checks must pass).
4. CI runs on the PR. Squash-merge once green; the branch is auto-deleted on
   merge. This does not deploy anything.
5. When ready to release, cut a tag from the commit you want deployed and push it.

Squash merge only (merge commits and rebase merges are disabled) to keep a linear
history.

### Bootstrap order (empty repo)

The branch-protection ruleset is applied LAST, not first: `git init` -> establish
`main` -> first-push `main` and let CI produce the required checks once -> THEN
apply `main-ruleset.json`. Applying a restrictive ruleset before the first code
import would block that import.

## Branch protection (GitHub Rulesets, not legacy protection)

Enforced via repo Rulesets (`gh api repos/vxture/<repo>/rulesets`). The
authoritative ruleset is `docs/50-deployment/rebuild/main-ruleset.json`.

**Required checks (authoritative set of five):** `quality-gate` / `build` /
`test-coverage` / `audit` / `gitleaks`. CI job names must produce exactly these
five contexts - renaming a job breaks branch protection. Never remove a check
from the required set.

## CI/CD pipeline

`ci.yml` triggers on PRs to `main` and on `push:main`; it does NOT deploy.

- `quality-gate` aggregates the static checks: whitespace/conflict-marker check,
  the docs numbering guardrail, the data-architecture guardrail (DDL <-> Prisma
  lockstep), and the workflow guardrail (workflows parse and keep triggers).
- `build`: `pnpm type-check:all` plus the NestJS esbuild bundle build.
- `test-coverage`: `pnpm --filter @vxture/service-model-platform test`.
- `audit` (separate required check): `osv-scanner` (pinned binary) scans
  `pnpm-lock.yaml`, hard-blocking on any new finding, with
  `--config .osv-scanner.toml`.
- `gitleaks` (separate required check, `.github/workflows/secret-scan.yml`):
  pinned gitleaks binary, full-history `detect`.

The tag-to-env deploy workflows (`deploy.yml`/`build.yml`/`rollback.yml`/
`db-init.yml`) and the `tailnet-ssh-connect` composite action follow the org
CD reference pattern (vxture-arda) but are unexercised here until the GitHub
and platform bootstrap checklists are done and a deploy host is assigned.

## Secret hygiene (four layers)

Credentials never enter the repo - only environment/config injection. Leaks are
revoked at the source console, not scrubbed from history. Dev-phase repos are
PUBLIC (no private fallback), so "credentials never committed" is an absolute
rule, not a posture backed by a private boundary.

1. GitHub secret scanning + push protection (repo setting).
2. `gitleaks` CI (`.github/workflows/secret-scan.yml`).
3. Local `.husky/pre-commit` - wire once per clone with
   `git config core.hooksPath .husky`.
4. Public posture, all-rights-reserved (no LICENSE file, no `license` field).

Shared credentials (ACR, tailscale, npm token) are org-level: configured once and
shared to selected repos, not duplicated per repo.

## Dependency security (SCA)

`audit` = osv-scanner hard gate over `pnpm-lock.yaml`. Fix (upgrade / pnpm
override / exact pin for peer-only deps) or record a named `[[PackageOverrides]]`
exception with a reason - never widen the gate.

## Docs taxonomy

`docs/` follows the org docs taxonomy for the shared skeleton: top-level decades
`00-meta` / `10-standards` / `20-specs` / `30-design` / `40-implementation` /
`50-deployment` / `60-operations` / `70-workplan` / `80-liaison` / `90-memory`;
map in `docs/00-meta/00-index.md`. Numbered = formal, unnumbered = temporary.

ADRs live in `docs/30-design/decisions/` with stable append-only IDs; the
tech-debt register lives in `docs/60-operations/10-tech-debt.md` (`TD-NNN`).

## Rigid zone / blank zone

**Rigid (do not deviate):** the entire governance base; CI/CD key names, job
names, workflow semantics; the three-channel module endpoints/signing/idempotency/
gating formula/cache discipline (for the subset that applies to atlas - see
product_240 section 3); value-domain consumption; DB governance (DDL
three-part + column locks + db-init as the sole structure-change path); docs
numbering; the data-face hard constraints; Atlas's role as the sole inference-
metering entry point for every other product.

**Blank (Atlas decides):** the S2S provider surface's actual endpoint shapes for
embedding/parse/rerank (karda has submitted field-level requirements as design
input, `docs/80-liaison/00-index.md` - not a contract, a starting point);
model-runtime internal structure (registry/router/quota/metering/providers,
carried over from the in-monorepo implementation); the `20-specs/` product
definition; domain guardrails.

## Repository hygiene

- Keep the working tree clean; do not commit local runtime artifacts (`.env`,
  generated data, certs, caches) - they are git-ignored on purpose.
- After a merge, prune stale remotes: `git fetch --prune`.
- Keep source, config, and root meta files (`.gitignore`, `.editorconfig`,
  `.gitattributes`, `.npmrc`, `.gitleaks.toml`, `CLAUDE.md`, `README.md`)
  ASCII-only - no em-dashes, smart quotes, or non-ASCII characters.
