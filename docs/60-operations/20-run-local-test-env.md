# Run the local test environment

Brings up Atlas against a local database whose structure is identical to
production, with test data and one real upstream provider, and proves the chain
with real tokens. No mocks and no forged tokens: if the IdP or the provider is
unreachable, the run fails rather than degrading.

## What it talks to

| Piece | Where | Notes |
|---|---|---|
| Atlas | host process, `:3100` | the port `admin-bff`'s `ATLAS_API_URL` defaults to |
| Database | container `atlas-db` (compose project `atlas`) | published to `127.0.0.1:5432` by a socat sidecar; the compose service itself publishes no port |
| Platform IdP | `auth-bff` on `:3090` | issuer is literally `http://localhost:3090`, which is why Atlas runs on the host rather than in a container - a container cannot reach that name |
| Operator console | opera on `:3050` -> admin-bff `:3031` -> Atlas | opera mints operator tokens itself; nothing here needs to be configured for it |
| Upstream | Volcano Ark | the only real provider; the key lives in `.env.provider-keys` |

## Structure parity with production

The local database is built by the same three-part baseline plus increments
that `db-init.yml` applies in production, through `deploy/database/apply.sh`.
To prove parity rather than assume it, apply the DDL into a scratch database
and diff the dumps:

```bash
docker exec atlas-db psql -U postgres -q -c "CREATE DATABASE atlas_ddl_verify;"
for f in deploy/database/ddl/00_baseline.sql \
         deploy/database/ddl/97_service_role.sql \
         deploy/database/ddl/98_column_locks.sql \
         deploy/database/ddl/incr/*.sql; do
  docker exec -i atlas-db psql -U postgres -d atlas_ddl_verify -q -v ON_ERROR_STOP=1 -f - < "$f"
done

docker exec atlas-db pg_dump -U postgres -d vxturestudio_modelruntime_main \
  --schema-only --no-owner --no-comments -n key -n reqlog -n routing -n model -n provisioning > /tmp/cur.sql
docker exec atlas-db pg_dump -U postgres -d atlas_ddl_verify \
  --schema-only --no-owner --no-comments -n key -n reqlog -n routing -n model -n provisioning > /tmp/fresh.sql
diff /tmp/cur.sql /tmp/fresh.sql   # only pg_dump's random \restrict token should differ
docker exec atlas-db psql -U postgres -q -c "DROP DATABASE atlas_ddl_verify;"
```

The dump includes GRANTs, so this also verifies the column locks
(`98_column_locks.sql`), not just table shape.

## Setup

1. **Publish the database port.** The compose `db` service deliberately
   publishes nothing; forward it instead of editing the production-shaped
   compose file:

   ```bash
   docker run -d --name atlas-db-fwd --network atlas-net -p 127.0.0.1:5432:5432 \
     alpine/socat tcp-listen:5432,fork,reuseaddr tcp:atlas-db:5432
   ```

2. **Give the service role a password** (the DDL creates `atlas_svc` without
   one; production injects it at bootstrap):

   ```bash
   docker exec atlas-db psql -U postgres -c "ALTER ROLE atlas_svc LOGIN PASSWORD '<local-password>';"
   ```

3. **Write `.env`** (git-ignored) at the repo root - `DATABASE_URL` pointing at
   `atlas_svc@127.0.0.1:5432`, `OIDC_ISSUER=http://localhost:3090`,
   `S2S_AUDIENCE=atlas`, and a `PROVIDER_KEY_ENCRYPTION_KEYS` /
   `..._ACTIVE_KEY_ID` pair for the key vault. Leave `PLATFORM_API_URL` empty:
   with no C2 endpoint the quota gate stays permissive and `usage_event_id`
   stays NULL, which is the documented reconciliation signal, not a fault.

4. **Write `.env.provider-keys`** with the real `DOUBAO_API_KEY`. Separate file
   on purpose - see `docs/50-deployment/00-index.md`.

5. **Seed and run**:

   ```bash
   pnpm --filter @atlas/service db:generate
   node scripts/dev/seed-test-data.mjs
   pnpm --filter @atlas/service build
   export $(grep -v '^#' .env.provider-keys | xargs)
   node service/dist/main.cjs          # from the repo root - it reads ./.env
   ```

   Run it from the repo root: `loadRootEnv` looks for `.env` relative to the
   working directory. `main.cjs` does not read `.env.provider-keys`; compose
   supplies it as a second `env_file`, so locally it is exported by hand.

6. **Verify**: `/readyz` should report `status: "ready"` with `database`,
   `modelRegistry`, `providerKeys` and `reqlogPartitions` all passing.

## Test data

`scripts/dev/seed-test-data.mjs` fills the registry: 5 providers, 9 models
across chat/embedding/rerank, 13 grants over four real tenants from the local
platform DB, price rules, rate policies, routing and fallback rules, and four
envelope-encrypted vault keys.

Only doubao is real. Its two models answer live, one through the managed vault
and one through the legacy env-var path, so both key resolutions are exercised.
The rest are fixtures: correct in shape, no account behind them - they fail at
the provider boundary, which is where a fixture should fail.

The script connects as `atlas_svc`, exactly like the application. It therefore
cannot TRUNCATE and cannot UPDATE identity columns, so it deletes and
re-inserts. That is not a workaround - it is the column-lock governance
(`98_column_locks.sql`) doing its job, and a seed script that needed owner
rights would be a sign the data model had drifted.

## End-to-end check

```bash
node scripts/dev/s2s-smoke.mjs
```

Mints a real S2S token from the local IdP by RFC 8693 token exchange (the
`console` client is on the platform-level S2S allowlist, so no platform-side
data change is needed), then drives: unauthenticated rejection, plane
separation (an S2S token must not reach `/capability/*`), registry reads,
`/tenancy/*` scope derived from the token, two real doubao generations, task-
profile routing, and the honest failures - unknown profile 404, ungranted model
403, discovery omitting `atlas.parse`.

After a run, `reqlog.request_records` carries the real calls with token counts,
latency and workspace attribution, and `usage_event_id IS NULL` because C3 is
not wired locally.

## Known local deviations from production

- `/healthz` reports `version:"dev"`, `gitSha:"unknown"` - build provenance is
  injected by CI build args, not by a local build.
- The quota gate is permissive: no `PLATFORM_API_URL`, so no entitlement
  source (TD-016, ADR-001).
- Nothing is reported to the platform metering kernel; local runs only write
  Atlas's own history.
