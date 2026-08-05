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
  `vx_atlas_postgres_db`, zero cross-database FK to the platform DB.
- `portals/` or any app-profile scaffolding.
- C3 `grant.invalidated` or the visible-set recall filter (atlas is not an
  asset-face product in the sharing-grant sense).
- An `agent-server/` slot.

What it DOES carry is an **obligation**, which is not the same as implemented.
Per-module status is `docs/40-implementation/00-index.md`; open gaps are
`docs/60-operations/10-tech-debt.md`. The obligations:

- the full governance base
- C3 provisioning webhook
- the S2S surface as a **caller** (outbound to Doubao/Claude/Zhipu/private)
- the S2S surface as a **provider** (`/v1/*`)
- C2 entitlement read ahead of every call
- **C3 consume as the sole inference-metering entry point for every other
  vxture product** - karda/arda/varda token usage flows through Atlas, not
  their own metering; boundary design in
  `docs/30-design/210-usage-metering-and-history.md`
- OIDC RP five endpoints - inherited but never built, and no controller
  exists. Atlas has no end-user browser surface and the operator UI lives in
  `vxture-platform`'s portals, so this has never been needed; do not read the
  obligation as done code

## Name cascade (product code `atlas`)

OIDC client pair `atlas` / `atlas-beta`; compose project and app container
`atlas-app`; image name `atlas-app`; workspace package
`@atlas/service` (matching the sibling convention `@arda/app` / `@karda/app`;
renamed 2026-07-28 from the inherited `@vxture/service-model-platform`, see
TD-013); NestJS root module `AtlasModule`; health identity `service: "atlas"`
and metrics label `component: "atlas"` (standard 025); service role
`atlas_svc`; secrets
`ATLAS_DB_SVC_PASSWORD`, `ATLAS_PROVISION_WEBHOOK_SECRET`,
`ATLAS_WEBHOOK_BASE_URL`; public host `atlas.vxture.com` (reserved, not yet
bound - Atlas is tailnet-only today, see docs/50-deployment/00-index.md).

**Datastore names are their own derivation** (2026-08-05), because a product
can run more than one and the engine has to be visible in the name:

```
container   vx-<product_code>-<engine>-db-<env>    vx-atlas-postgres-db-prod
database    vx_<product_code>_<engine>_db          vx_atlas_postgres_db
```

`<product_code>` and `<env>` are derived (`PRODUCT_CODE`, `DEPLOY_ENV`);
`<engine>` is a literal per compose service - `postgres` today, `redis` when a
session store lands. The database name is snake_case on purpose: a hyphen in a
Postgres identifier forces double quotes in every hand-written statement.
Redis has no database-name concept, so only the container rule applies to it.

Four places derive these and must agree - `docker-compose.yml`,
`deploy/deploy.sh`, `db-init.yml`, and `deploy.yml`'s delivery check. A
disagreement means db-init silently targets a database nobody runs against.

HTTP paths are NOT part of this cascade - `/v1/*` (data plane) and
`/capability/*` (operator plane) are deliberate, see
`docs/20-specs/10-http-surface.md`.

## Build status

Live in production on worker-02 with karda as a real S2S consumer. Do not
restate status here - it goes stale. What is done and what is left:
`docs/70-workplan/00-index.md`.

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

**`bypass_actors` MUST stay empty.** A bypass actor makes every rule above
advisory for that actor, so a direct `git push origin main` succeeds silently -
which is how this repo's "direct push is BLOCKED" claim was once false
(TD-020). Admin can still break glass by editing the ruleset; the difference is
that this is a recorded config change instead of an invisible per-push
exemption. Do not re-add a bypass actor to make an urgent merge easier.

## CI/CD pipeline

`ci.yml` triggers on PRs to `main` and on `push:main`; it does NOT deploy.

- `quality-gate` aggregates the static checks: whitespace/conflict-marker check,
  the docs numbering guardrail, the data-architecture guardrail (DDL <-> Prisma
  lockstep), and the workflow guardrail (workflows parse and keep triggers).
- `build`: `pnpm type-check:all` plus the NestJS esbuild bundle build.
- `test-coverage`: `pnpm --filter @atlas/service test`.
- `audit` (separate required check): `osv-scanner` (pinned binary) scans
  `pnpm-lock.yaml`, hard-blocking on any new finding, with
  `--config .osv-scanner.toml`.
- `gitleaks` (separate required check, `.github/workflows/secret-scan.yml`):
  pinned gitleaks binary, full-history `detect`.

The tag-to-env deploy workflows (`deploy.yml`/`build.yml`/`rollback.yml`/
`db-init.yml`) and the `tailnet-ssh-connect` composite action follow the org
CD reference pattern (vxture-arda). See `docs/50-deployment/00-index.md`.

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

Each document has one job. Design documents state the final design, not how it
was reached; implementation documents state current status; the workplan is a
done/to-do checklist. A decision is recorded once as an ADR and referenced
elsewhere - do not restate its reasoning in a second file. History belongs in
git, not in progress notes appended to documents.

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
