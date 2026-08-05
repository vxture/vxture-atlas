# 50-deployment - Infra, CI/CD, environments

Current deployment facts. The cross-repo authority for host allocation is
`vxture-platform`'s `docs/50-deployment/13-infra-allocation-registry.md`; this
file is the local view.

## Infra allocation

| Item | Value |
|------|-------|
| Deploy host | worker-02 (`100.76.219.48`), shared with arda/varda/vxtpl |
| Stack root | `/srv/md0/atlas` |
| Published port | `3100` (inherited from the in-monorepo service, not an app-profile `32X0/32X1` pair). `APP_PUBLISH_PORT=3100` is consumed only by compose's port mapping on the host's own `.env` |
| Public domain | `atlas.vxture.com` - reserved, not bound. Atlas is tailnet-only and has no browser surface, so no edge vhost is scaffolded |
| Tailnet | class 2 (product_230 D1) |
| ACR namespace | `ALIYUN_ACR_NAMESPACE=vx-foundation`; `ALIYUN_ACR_REGISTRY` and credentials are org-level |
| Environments | `production` (required reviewer). No `beta` - see TD-001 |

Registry order is ACR primary, GHCR fallback -
[ADR-005](../30-design/decisions/ADR-005-acr-primary-ghcr-fallback.md). Builds
push to both; only the pull order differs.

## Datastore naming

```
container   vx-<product_code>-<engine>-db-<env>    vx-atlas-postgres-db-prod
database    vx_<product_code>_<engine>_db          vx_atlas_postgres_db
```

`<product_code>` comes from `PRODUCT_CODE` and `<env>` from `DEPLOY_ENV`
(routed from the deploy tag; `dev` for a local stack). `<engine>` is a literal
per compose service, so a second datastore is named the same way - a session
store would be `vx-atlas-redis-db-prod`.

Four places derive these independently and must agree: `docker-compose.yml`,
`deploy/deploy.sh`, `db-init.yml`, and `deploy.yml`'s compose delivery check.

## One-time rename on the production host

Renaming in the repo does **not** rename anything on the host. `POSTGRES_DB` is
read by the Postgres entrypoint only when it initializes an empty data
directory, so an existing cluster keeps its old database name no matter what
compose says.

What does NOT need to change: `DATABASE_URL`'s host segment. The operator .env
already points at the compose **service alias** (`@db:5432`), not at the
container name, so renaming containers never touches it. Keep it that way -
the alias is stable by construction.

```bash
# On worker-02. The database is ~10 MB, so the dump is instant insurance.
cd /srv/md0/atlas
docker exec atlas-db pg_dump -U postgres -Fc vxturestudio_modelruntime_main > "backup-pre-rename-$(date +%Y%m%d%H%M).dump"

# 1. Stop the app so nothing holds a session on the database being renamed.
#    ALTER DATABASE ... RENAME fails while any connection to it is open.
docker stop atlas-app

# 2. Rename in place. Metadata-only: data, roles and grants are untouched.
docker exec atlas-db psql -U postgres -d postgres -c 'ALTER DATABASE vxturestudio_modelruntime_main RENAME TO vx_atlas_postgres_db;'

# 3. Repoint the operator .env - the database name only.
sudo sed -i 's#/vxturestudio_modelruntime_main#/vx_atlas_postgres_db#' etc/.env

# 4. Bring the app back on the CURRENT containers.
docker start atlas-app
```

The stack is now correct and serving; the container names are still the old
ones. They change on the next deploy, when compose recreates both services
against the same data directory - no further manual step, because nothing
references a container by name from inside the network.

Verify after step 4 and again after the deploy: `/readyz` reports
`database: pass`, and `docker ps` shows the expected names.

Rollback is the same rename in reverse plus the inverse `sed`. Do not run
`db-init` between the rename and the deploy: it targets the new container
name, which does not exist yet.

## Tag to environment

- `beta-YYYYMMDD.N` -> beta stack, no approval gate. Dormant (TD-001).
- `vX.Y.Z` -> production, gated by a required reviewer on the `production`
  GitHub Environment.

Merging to `main` deploys nothing. `dev-*` and `varda-*` tags are
platform-repo-only.

## Workflows

`build.yml` / `deploy.yml` / `rollback.yml` / `db-init.yml` plus the
`tailnet-ssh-connect` composite action, following the org CD reference pattern
(vxture-arda). Every deploy publishes an immutable `sha-<short>` image tag;
`deploy.sh`'s `cmd_all` prunes unreferenced images afterwards so the host disk
does not accumulate them.

DB structure changes run only through `db-init.yml` (`confirm=yes` +
`expected_sha` + production approval) against `deploy/database/ddl/`. The
routine deploy chain never runs migrations or seeds.

## Secrets

- `DEPLOY_WORKER02_*` (`HOST`/`USER`/`SSH_KEY`/`SSH_KEY_PASSPHRASE`/
  `KNOWN_HOSTS`/`PORT`), `ALIYUN_ACR_*`, `TAILSCALE_OAUTH_*`, `NODE_AUTH_TOKEN`
  are org-level, shared to the repos deploying to worker-02. This repo only
  needs to be on the sharing allowlist.
- `DEPLOY_DIR` and `ENV_FILE_BASE64` are per-repo - genuinely product-specific,
  not host-targeting.
- `DEPLOY_WORKER02_KNOWN_HOSTS` is mandatory and fail-closed in
  `.github/actions/tailnet-ssh-connect`; collect it with
  `ssh-keyscan -p <port> <host>` from a trusted network.

## Provider API keys - separate env file

Legacy `config.apiKeyEnvVar` keys (`DOUBAO_API_KEY` etc.) load from
`<stack_root>/etc/.env.provider-keys`, a second `env_file:` entry
(`APP_PROVIDER_KEYS_ENV_FILE`, `required: false`) kept **separate** from the
general `<stack_root>/etc/.env`.

Why separate: `deploy.yml` bootstraps `.env` from a GitHub secret on first
deploy but never touches this file. An operator creates it over SSH, so it can
carry stricter permissions (`chmod 400`) and its plaintext never transits
GitHub Actions - a smaller blast radius for the one class of secret that is
read on every model call.

```bash
sudo touch /srv/md0/atlas/etc/.env.provider-keys
sudo chmod 400 /srv/md0/atlas/etc/.env.provider-keys
sudo nano /srv/md0/atlas/etc/.env.provider-keys   # DOUBAO_API_KEY=<real key>
cd /srv/md0/atlas && docker compose restart app   # env_file is read at container start
```

The managed vault
([ADR-003](../30-design/decisions/ADR-003-provider-key-vault-envelope-encryption.md))
is the target state and needs neither this file nor `.env`; this file only
covers models still on the legacy path.

## Base-image mirror

worker-02's `/etc/docker/daemon.json` (set by the platform's host bootstrap,
not per-repo) uses an Aliyun Docker Hub mirror. Atlas's stack pulls only
`postgres:16-alpine`.

## Branch protection

`rebuild/main-ruleset.json` is authoritative; apply via
`gh api repos/vxture/vxture-atlas/rulesets`. `bypass_actors` must stay empty.
