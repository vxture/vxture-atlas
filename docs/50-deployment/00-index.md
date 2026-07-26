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
| Published port | `3100` (fixed - inherited from the in-monorepo `model-platform` service; not a fresh `32X0/32X1` app-profile pair. No beta port yet - beta tier stays out per TD-001 until a dedicated beta host exists). Repo variable `APP_PUBLISH_PORT=3100` set 2026-07-26, matching `docker-compose.yml`'s existing default - this variable is only consumed by compose's port mapping (`${APP_PUBLISH_PORT:-3100}:3100`) on the host's own `.env`, not read anywhere in the GitHub workflows, so it doesn't need any CI-side wiring. |
| Public domain | `atlas.vxture.com` (reserved, not bound - Atlas is tailnet-only today; no edge vhost is scaffolded here, unlike karda, because Atlas currently has no browser-facing surface for a vhost to protect) |
| Tailnet | class 2 (same-apex platform tailnet fabric, per `product_230_mesh-architecture.md` D1) |
| ACR namespace | **resolved 2026-07-26** - repo variable `ALIYUN_ACR_NAMESPACE=vx-foundation` set for vxture-atlas. Org-level `ALIYUN_ACR_REGISTRY` and the `ALIYUN_ACR_USERNAME`/`ALIYUN_ACR_PASSWORD` secrets were already shared to this repo (confirmed via `gh api orgs/vxture/actions/variables` 2026-07-26); this closes the last repo-side config gap for ACR-primary deploys. Still separately blocked on real `DEPLOY_*`/tailscale secrets and the `production` GitHub Environment (see below) before a deploy can actually run end to end. |

## Registry primary/fallback (deviates from governance default)

**Owner decision 2026-07-26: ACR primary, GHCR fallback** for worker-02
(`.github/workflows/deploy.yml`, the remote deploy script's `IMAGE_REGISTRY`/
`FALLBACK_IMAGE_REGISTRY` export). This is a deliberate deviation from
`140-repo-governance-standard.md` section 5's default for non-VPC hosts (GHCR
primary) - that default assumes ACR is only reachable over its paid public
endpoint from a non-VPC host, with no guaranteed speed advantage over GHCR.
The owner chose ACR-primary anyway for worker-02. If this is later found to
be slower/costlier in practice than GHCR-primary (public ACR egress is
billed; GHCR pulls are free), revisit here - this is a per-host operational
choice, not itself a new governance rule, and does not need to propagate to
sibling repos (arda/karda remain GHCR-primary on the same host) unless the
owner decides otherwise.

Build (`build.yml`) always pushes to both registries regardless of which is
primary - only the deploy-side pull order is affected.

## Docker registry mirror (base images, e.g. postgres)

Already configured at the host-bootstrap level, not per-repo: worker-02's
`/etc/docker/daemon.json` (`vxture-platform`'s
`deploy-manual-init/bootstrap/11-bootstrap-host.sh`) sets
`vp6xaxdh.mirror.aliyuncs.com` as the primary Docker Hub registry mirror
(plus three fallback mirrors) - this speeds up pulling `postgres:16-alpine`
(the only base image Atlas's stack pulls today; no nginx/redis service exists
in `docker-compose.yml` yet, see its header comment). No Atlas-side change
needed; worth a one-time ops check that this bootstrap script actually ran on
worker-02.

## Old image cleanup

`deploy/deploy.sh`'s `cmd_all` now runs `cmd_prune` (`docker image prune -af`)
after a verified deploy, since every deploy publishes a new immutable
`sha-<short>` app image tag (`build.yml`) that would otherwise accumulate on
the host disk indefinitely. Only images with zero referencing containers are
removed - the currently-running tag is never a candidate. This is separate
from (and does not replace) the platform-wide `docker image prune -af` in
`vxture-platform`'s `31-regular-upgrade-platform.sh` maintenance job, if that
job also covers this host.

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
