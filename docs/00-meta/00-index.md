# 00-meta - Documentation map

Top-level index for this repository's `docs/`. The tree follows the org docs
taxonomy (`070-docs-taxonomy.md`) for the shared skeleton - ten decade-numbered
top directories, `00-index.md` in every directory, numbered files and
directories, numbered = formal / unnumbered = temporary.

How documents are numbered and organized INSIDE this repo is delegated to the
repo (taxonomy section 3): see **`10-docs-convention.md`** in this directory,
the local authority. The platform repo's `{kind}_{domain}_{NNN}_{slug}` domain
family is NOT used here - a single-domain repo separates by directory and
number band instead. The `lint:docs-numbering --strict` guardrail enforces the
convention (file names, directory names, root-only README whitelist) on every
push.

| File | Purpose |
|------|---------|
| `10-docs-convention.md` | this repo's docs numbering and organization convention (local authority) |

| Decade | Directory | Holds |
|--------|-----------|-------|
| `00-meta` | this directory | the docs map, the docs convention, meta-notes about the docs themselves |
| `10-standards` | `10-standards/` | thin index pointing at the org standards (text lives in the platform repo, not copied here) |
| `20-specs` | `20-specs/` | product/business specifications |
| `30-design` | `30-design/` | architecture, ADRs, domain design, DB schema; three-digit bands `1xx` design / `2xx` contracts and schema / `3xx` implementation |
| `40-implementation` | `40-implementation/` | package/layer guides, coding rules, dev setup |
| `50-deployment` | `50-deployment/` | infra, CI/CD, environments, bootstrap checklists, the branch-protection ruleset |
| `60-operations` | `60-operations/` | runbooks (`NN-run-*.md`), audits, the tech-debt register (`TD-NNN`), incidents |
| `70-workplan` | `70-workplan/` | build plan and batch tracker |
| `80-liaison` | `80-liaison/` | cross-org liaison (reply letters, integration agreements) |
| `90-memory` | `90-memory/` | in-repo AI handoff (`10-agent.md`) |

## Authority

This repo carries the org governance base as an extraction from vxture-platform
(product code `atlas`). The governing standards are NOT copied here; they live
in the platform repo (`D:\MyWebSite\vxture`):

- `docs/10-standards/140-repo-governance-standard.md` - governance base (WHAT)
- `docs/10-standards/070-docs-taxonomy.md` - docs numbering (shared skeleton;
  section 3 delegates in-repo organization to this repo)
- `docs/30-design/product_240_repo-template.md` - template design; section 3
  matrix defines exactly which modules apply to atlas as an L1 product (not
  the full app-profile set arda/karda/terra get)
- `docs/50-deployment/rebuild/20-self-rectify-runbook.md` - runbook (HOW + checks)

A `product_NNN_*` / `data_*` / `design_*` reference anywhere in this repo's docs
points at a PLATFORM-repo document, never a local one - local documents are
always `NN(N)-slug`.
