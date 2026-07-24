# vxture-atlas

Atlas - Vxture's L1 model platform: unified model access, routing, quota, and
metering. The sole LLM/model egress point for every other vxture product
(karda, arda, varda, etc. all consume models through Atlas, never directly).

Extracted from the `vxture-platform` monorepo's combined
`@vxture/service-model-platform` implementation, so it inherits the org
governance base unchanged: trunk-based branching, the branch-protection
ruleset, four-layer secret hygiene, the SCA hard gate, the docs numbering
system, and the applicable subset of the platform integration surface (OIDC
RP, C2 entitlement, C3 provisioning + the sole inference-metering consume
path).

**Repo profile: services** (product_240 section 2.5), not app profile - there
is no Next.js app, no `portals/`, no browser-facing UI. The source is a single
NestJS service under `service/`.

**Package manager:** pnpm (whole-stack, owner-decided 2026-07-20).

---

## Cascaded names (product code `atlas`)

| Thing | Value |
|-------|-------|
| OIDC clients | `atlas` / `atlas-beta` |
| compose project / containers | `atlas-app` / `atlas-db` |
| image name | `atlas-app` |
| database | `vxturestudio_modelruntime_main` (own physical DB, not a shared-platform-DB schema, not a business-plane `vxturebiz_atlas_{env}` DB either) |
| service role | `atlas_svc` |
| secrets | `ATLAS_DB_SVC_PASSWORD`, `ATLAS_PROVISION_WEBHOOK_SECRET`, `ATLAS_WEBHOOK_BASE_URL` |
| public host | `atlas.vxture.com` (reserved, not bound - tailnet-only today) |

`.env.example` is the authoritative reference for every supported variable.

---

## Authority

The governing standards are NOT copied here; they live in the platform repo
(`D:\MyWebSite\vxture`):

- Governance (WHAT): `docs/10-standards/140-repo-governance-standard.md`
- Docs numbering: `docs/10-standards/070-docs-taxonomy.md`
- Template design: `docs/30-design/product_240_repo-template.md` (section 3
  matrix defines exactly which modules apply to atlas as an L1 product - not
  the full app-profile set)
- Self-rectify runbook (HOW + machine checks):
  `docs/50-deployment/rebuild/20-self-rectify-runbook.md`

`docs/10-standards/` here carries a thin index pointing at those, not their
text.

---

## Repository state

The governance shell is scaffolded. The actual `service/` NestJS source (the
current `@vxture/service-model-platform` implementation) arrives via a
history-preserving `git filter-repo` move, not a flat copy - see
`docs/70-workplan/00-index.md` for the extraction plan and current status.

Not yet done: GitHub bootstrap, platform-side registration completion (deploy
host is unassigned), the data-layer migration into this repo's own DDL
(`model.*` + `key`/`reqlog`/`routing`, physically separate from the platform
DB), replacing the in-monorepo service's direct cross-schema Prisma reads with
the standard C2/C3 network contract, and the S2S provider surface for
embedding/parse/rerank (karda has already submitted field-level requirements
as design input - see `docs/80-liaison/00-index.md`).

---

## Local development

```bash
pnpm install
pnpm type-check:all
pnpm lint
pnpm lint:docs-numbering
```

A `NODE_AUTH_TOKEN` with read access to GitHub Packages must be set so
`pnpm install` can resolve the `@vxture` scope (see root `.npmrc`).

---

## Working agreement

See [CLAUDE.md](CLAUDE.md) for the full repository working agreement.
