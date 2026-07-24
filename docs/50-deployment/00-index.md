# 50-deployment - Infra, CI/CD, environments, bootstrap checklists

## Infra allocation

Host assignment **owner-confirmed 2026-07-24** (see `docs/70-workplan/00-index.md`
Phase 6). Still needs mirroring into vxture-platform's own
`docs/50-deployment/13-infra-allocation-registry.md` product row (out of this
repo's write-scope) before it's the cross-repo source of truth, and still
needs real secrets/GitHub Environment before a deploy can actually run.

| Item | Value |
|------|-------|
| Deploy host | **worker-02** (`100.76.219.48`, business host - same as arda/varda/vxtpl) |
| Stack root | `/srv/md0/atlas` |
| Published port | `3100` (fixed - inherited from the in-monorepo `model-platform` service; not a fresh `32X0/32X1` app-profile pair. No beta port yet - beta tier stays out per TD-001 until a dedicated beta host exists) |
| Public domain | `atlas.vxture.com` (reserved, not bound - Atlas is tailnet-only today; no edge vhost is scaffolded here, unlike karda, because Atlas currently has no browser-facing surface for a vhost to protect) |
| Tailnet | class 2 (same-apex platform tailnet fabric, per `product_230_mesh-architecture.md` D1) |
| ACR namespace | TBD (repo `vars.ALIYUN_ACR_NAMESPACE`, never hardcoded) |

## GitHub bootstrap (one-time, not yet done)

1. `git init` -> establish `main` -> first push -> let CI run once (produces
   the five required check contexts) -> THEN apply
   `docs/50-deployment/rebuild/main-ruleset.json`. Applying the ruleset first
   blocks the initial import.
2. Create GitHub Environments: `production` (required reviewer) and, once a
   beta host exists, `beta` (no reviewer gate).
3. Populate secrets/vars per `.env.example` and the workflow files under
   `.github/workflows/` (`DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY`/
   `DEPLOY_KNOWN_HOSTS`/`DEPLOY_DIR`, `ALIYUN_ACR_*`, `TAILSCALE_OAUTH_*`,
   `NODE_AUTH_TOKEN`). Org-level shared credentials (ACR/tailscale/npm token)
   only need this repo added to the sharing allowlist, not rebuilt.
4. `DEPLOY_KNOWN_HOSTS` is mandatory (fail-closed in
   `.github/actions/tailnet-ssh-connect`) - collect via
   `ssh-keyscan -p <port> <host>` from a trusted network once the host exists.

## Platform-side registration (not yet done)

See the karda A/B-segment precedent (`vxture-platform` repo,
`docs/80-liaison/`) for the pattern: product catalog row, OIDC client, plan
skeleton, provisioning webhook address, secret transport - all owner-gated,
none of it agent-self-approved. As of this scaffold, the platform repo already
carries a partial head start for atlas (OIDC client descriptor, base-URL env
placeholders, product catalog row + 5-tier DRAFT plan skeleton) - see the
platform repo's `deploy/database/seed/seed-catalog.mjs` and
`docs/30-design/product_100_matrix.md` atlas row.

## Deploy pipeline

`deploy.yml` / `build.yml` / `rollback.yml` / `db-init.yml` and the
`tailnet-ssh-connect` composite action follow the org CD reference pattern
(vxture-arda). Authored but unexercised until the GitHub bootstrap and host
assignment above are done.
