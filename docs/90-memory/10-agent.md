# Agent entry point

Start here if you are an AI agent working in this repo.

## What this repo is

`vxture-atlas` - Atlas, Vxture's L1 model platform: unified model access,
routing, quota and metering. The sole LLM/model egress point for every other
vxture product. Extracted from `vxture-platform`'s combined
`@vxture/service-model-platform` implementation with product code `atlas`, so
it carries the org governance base, the applicable subset of the platform
integration contract surface (C1/C2/C3 - not the full asset-face set), and the
engineering shell as inherited, rigid material.

**Repo profile: services**, not app. There is no `portals/`, no Next.js, no
browser-facing UI. Source lives under `service/` (NestJS) - not yet migrated
in as of this scaffold; see `docs/70-workplan/00-index.md` Phase 4.

## Where authority lives

Not in this repo. The governing standards are in the platform repo
(`D:\MyWebSite\vxture`): `docs/10-standards/140-repo-governance-standard.md`
(WHAT), `docs/30-design/product_240_repo-template.md` (template design -
section 3 matrix is the authority for exactly which modules apply to atlas as
an L1 product), `docs/50-deployment/rebuild/20-self-rectify-runbook.md` (HOW +
machine checks), `docs/10-standards/070-docs-taxonomy.md` (docs numbering).
When you hit a gap not covered by an existing standard, fix the standard in
the platform repo first, then mirror it here - do not invent a standard
inside a product repo.

## Working rules

- Trunk-based: feature branch -> PR -> squash-merge -> delete branch. Never
  push `main` directly.
- The five required CI checks are a stable contract: `quality-gate` / `build` /
  `test-coverage` / `audit` / `gitleaks`. Do not rename the jobs that produce
  them.
- Docs: numbered = formal, unnumbered = temporary. Read
  `docs/00-meta/10-docs-convention.md` before adding a document. Local docs
  are `NN(N)-slug.md`; the platform `{kind}_{domain}_{NNN}_` family is NOT
  legal here.
- Atlas does NOT get the business-plane DB baseline
  (`vx_provision`/`local_authz`/`local_usage`) that arda/karda/terra get - its
  own data model (`key`/`reqlog`/`routing`/`model`, physically isolated,
  zero cross-database FK) is the whole story. Do not import the business-plane
  template here.
- Known open gaps: see `docs/60-operations/10-tech-debt.md` (TD-001 through
  TD-004) before assuming any of the platform integration channels are wired.
- karda has submitted field-level design input for the S2S provider surface
  (embedding/parse/rerank) - `docs/80-liaison/00-index.md` points at the
  master copy in the karda repo. Read it before designing those endpoints.
- Keep source, config, and root meta files ASCII-only.
- See `CLAUDE.md` (repo root) for the full working agreement, and
  `docs/70-workplan/00-index.md` for the phase tracker.
