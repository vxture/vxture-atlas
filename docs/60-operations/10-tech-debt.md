# Tech-debt register (TD-NNN)

Append-only IDs, never reused. Path pinned by the org taxonomy section 4.

Per the platform's deviation discipline
(`140-repo-governance-standard.md`, execution model): a standard clause that
cannot yet be met because an upstream dependency is not ready must be
(1) annotated at the implementation site, (2) registered here by name
(clause / reason / recovery condition), and (3) reported to the platform line.
Silent deviation fails self-rectify acceptance.

This file records the debt, not how it was found or fixed. For the history of
any entry, read the commit that closed it.

## Open

| ID | Title | Opened |
|----|-------|--------|
| [TD-001](#td-001) | Beta tier dormant - no beta host, so `beta-*` tags deploy nothing | 2026-07-24 |
| [TD-003](#td-003) | No real provider behind embed / parse / rerank | 2026-07-24 |
| [TD-004](#td-004) | S2S caller half (platform BFFs, varda) not wired to Atlas | 2026-07-24 |
| [TD-007](#td-007) | Provider-key vault has no operator UI | 2026-07-26 |
| [TD-009](#td-009) | Grant admin UI has no `taskProfile` field | 2026-07-27 |
| [TD-016](#td-016) | Quota gate stays permissive for uncovered workspaces | 2026-07-28 |
| [TD-019](#td-019) | `atlas.parse` cannot be advertised honestly | 2026-07-28 |
| [TD-023](#td-023) | Nothing stops the esbuild decorator-metadata trap recurring | 2026-08-05 |
| [TD-024](#td-024) | `reqlog.request_records.usage_type` is never written | 2026-08-06 |
| [TD-026](#td-026) | Third-party actions on mutable tags in the credential path | 2026-08-06 |
| [TD-027](#td-027) | Atlas has never been scanned by Sonar; the failure reported as success | 2026-08-06 |

## Closed

| ID | Title | Closed |
|----|-------|--------|
| TD-002 | Usage-metering write path was a no-op | 2026-07-28, by TD-017 |
| TD-005 | Service code referenced Prisma models removed by the DB split | 2026-07-28 |
| TD-006 | Provider API keys were env-var only; rotation required a redeploy | 2026-07-26, see [ADR-003](../30-design/decisions/ADR-003-provider-key-vault-envelope-encryption.md) |
| TD-008 | No `GET /.well-known/vxture-tools` capability-discovery endpoint | 2026-07-27 |
| TD-010 | A non-UUID `tenantId`/`applicationId` crashed as an unhandled 500 | 2026-07-27 |
| TD-011 | `model_grants.task_profile` shipped baseline-only; production never got the column | 2026-07-28 |
| TD-012 | `model_code` was sent verbatim as the upstream `model` field | 2026-07-28, `config.upstreamModel` |
| TD-013 | `model-platform` route prefix and package identity retired in favour of `atlas` | 2026-07-28 |
| TD-014 | Build provenance never reached the image; `/healthz` reported `version:"dev"` | 2026-07-28 |
| TD-015 | Capability discovery could not convey endpoint paths | 2026-07-28, product_210 §4.1a |
| TD-017 | Atlas recorded no usage anywhere | 2026-07-28, `reqlog` writes + C3 consume |
| TD-018 | `reqlog` partitions ran out 2027-01, then retention broke silently | 2026-07-28 |
| TD-020 | Branch protection was advisory for repo admins | 2026-07-28 for atlas/platform |
| TD-021 | `/capability/*` had no operator-identity verification | 2026-07-29 |
| TD-022 | Embed / parse / rerank looked up grants by workspace id in the tenant column | 2026-08-06 |
| TD-025 | The model admin API accepted `protocol` on update, which the database refused | 2026-08-06, `98_column_locks.sql` states the `model.models` rule |

TD-020 remains open in karda / arda / template, tracked in those repos
(`karda`#82, `arda`#187, `template`#37) - outside this repo's write-scope.

---

## TD-001

**Clause not met**: `140-repo-governance-standard.md` section 4 - product repos
run two tag-to-env tiers, `beta-*` to beta and `v*.*.*` to production.

**State**: production runs on worker-02:3100 (`/srv/md0/atlas`, tailnet class
2). The beta tier has no host, so a `beta-*` tag would deploy nothing and fail
confusingly; it stays out entirely.

**Recovery**: a dedicated beta host is assigned, then wire a `beta` GitHub
Environment (no reviewer gate) and a beta port pair.

**Annotated at**: `.github/workflows/deploy.yml` header, `docs/50-deployment/00-index.md`.

## TD-003

**Missing**: `POST /v1/embed` and `POST /v1/rerank` are served by Zhipu only -
any other provider returns `501 MODEL_NOT_IMPLEMENTED`. `POST /v1/parse` has no
provider at all. The registry also holds no `embedding`/`rerank`-typed models,
so even an implemented provider would have nothing to route to.

**Why deferred**: which upstream model to buy is a product/cost decision, not an
engineering one. The contract layer (auth, validation, gating, routing, error
codes) is deliberately complete without it - see
[ADR-002](../30-design/decisions/ADR-002-s2s-provider-surface-contract-layer-only.md).

**Recovery**: `vxture-atlas`#37 (A1 embedding), #38 (A2 parse), #39 (A3 rerank).
`RATE_LIMITED` (policy-driven rate limiting) and `RERANK_UNAVAILABLE` (fast-fail
degradation) land with the real provider - both need something real to throttle
or degrade.

**Owed to karda**: a measured P95 for 100-candidate rerank (`vxture-atlas`#36).
Blocked on #39; no number is promised before a real benchmark.

## TD-004

**Missing**: the caller half of S2S auth. Atlas verifies inbound tokens
(`S2sAuthGuard`, product_210 §3.3), and `console-bff` has cut over to
`/tenancy/*`. Still outstanding: `admin-bff` and `agent-server/varda` pointing
at Atlas's network address with minted S2S tokens.

**Why not fixed here**: those callers live in `vxture-platform`, out of this
repo's write-scope.

**Recovery**: `vxture-platform` wires the remaining callers; tracked as
`vxture-atlas`#66.

## TD-007

**Missing**: every other registry resource (providers / models / grants /
price-rules / policies) has an operator UI and BFF router in `vxture-platform`.
`/capability/provider-keys*` has none - keys can only be managed by calling the
API directly.

**Why not fixed here**: Atlas is a services-profile repo with no `portals/`
(product_240 section 2.5); the UI and BFF code live in `vxture-platform`.

**Recovery**: platform adds the page plus admin-bff/console-bff router entries,
following the existing providers pattern. The API it would call is stable.
Slotted into platform's atlas admin-module batch (`platform`#148).

## TD-009

**Missing**: `ModelGrantsPage.tsx` (platform admin portal) has no `taskProfile`
input, though the grant CRUD API accepts and returns it. Operators can only
configure task-profile routing by calling the API directly.

**Why not fixed here**: same as TD-007 - no `portals/` in this repo.

**Recovery**: platform adds the field, same shape as the existing
agentId/priority/reason inputs. Tracked with TD-007 under `platform`#148.

## TD-016

**State**: `PlatformEntitlementClient` exists and the quota gate can deny when
the platform reports a workspace's pools exhausted. What stays permissive is the
*uncovered* case - a workspace the platform has no entitlement record for.

**Why**: the platform's `atlas` plan catalog is still a draft skeleton with no
published `plan_version`. Denying on "uncovered" today would deny everyone.
The fail-open doctrine itself is
[ADR-001](../30-design/decisions/ADR-001-fail-open-quota-usage-doctrine.md).

**Recovery**: the platform publishes a real `atlas` plan_version; the uncovered
branch then flips from permit to deny.

## TD-019

**Wrong**: `ToolDescriptor` (product_210 §4.1) can express `deprecated`
(retiring) but not "defined, not yet implemented". `atlas.parse` is the second
state, and publishing it as formally identical to the three served capabilities
tells a consumer it is available - which it learns otherwise by 501.

**Interim**: `atlas.parse` is withheld from the published manifest. The
descriptor stays in source behind a flag, so restoring it is a one-line change.

**Recovery**: a real parse provider (`vxture-atlas`#38), or a maturity field on
the descriptor (`vxture-platform`#159).

## TD-023

**Wrong**: the deployed artifact is an esbuild bundle
(`service/package.json` `build`), and esbuild does not implement
`emitDecoratorMetadata` - it silently drops `design:paramtypes` even though
`tsconfig.json` sets the flag. Any Nest constructor injected by type alone
therefore resolves to `undefined` at runtime, and the endpoint 500s on first
use with `Cannot read properties of undefined`.

**Blast radius when found (2026-08-05)**: `MetricsRegistry` was additionally
absent from `AtlasModule.providers`, so the service could not boot at all on
`main` after the P0 dispatch change. Behind that, five controllers used
type-only injection: embedding, rerank, parse, tenancy and **the C3
provisioning webhook** - so `/tenancy/*` and `/provisioning/webhook` returned
500 in any bundled build. Production (v0.1.17) predates the boot failure but
carries the controller defect.

**Why the tests did not catch it**: vitest transpiles with swc, which *does*
emit the metadata, and the specs construct controllers directly. Nothing in CI
boots the Nest container from the bundle.

**Fixed here**: `MetricsRegistry` provided as the existing process singleton,
and explicit `@Inject()` added to all five controllers.

**Still open**: nothing enforces this. A new controller written in the natural
Nest style compiles, passes CI, and 500s in production. Options: a smoke step
that boots `dist/main.cjs` and hits `/readyz` plus one route per controller, an
esbuild decorator-metadata plugin, or a lint rule requiring `@Inject`.

## TD-024

**Missing**: `reqlog.request_records.usage_type` is declared (`normal` / `retry`
/ `test`) and the chat path still writes NULL.

**Half-closed by P2** (2026-08-06): `RequestLogService` now takes `usage_type`
from its caller, and the probe passes `test` against the all-zero sentinel - so
operator self-checks stay out of tenant usage views, which was the urgent half.
The chat and retry paths still pass nothing.

**Recovery**: chat passes `normal`, retries pass `retry`, then
`/tenancy/usage` can filter to `normal`/`retry`. Until then the filter cannot
be turned on, because NULL would exclude all real traffic.


## TD-026

**Wrong**: atlas pins `tailscale/github-action` and `aquasecurity/trivy-action`
to full commit SHAs, but `docker/login-action`, `docker/build-push-action`,
`docker/setup-buildx-action` and `SonarSource/sonarqube-scan-action` sit on
floating major tags. A tag is a mutable reference: repointing one yields
whatever secrets that workflow holds - for `docker/login-action`, the ACR
password.

**Not atlas's decision to make**: the governance standard pins *binaries*
(gitleaks, osv-scanner) and is silent on action refs, and `CLAUDE.md` forbids
inventing a standard in a product repo. Raised as
`vxture/vxture-platform#188`, which also carries the larger finding - the
standard names third-party action supply-chain risk for osv-scanner and then
hands production SSH keys and passphrases to `appleboy/*` on floating tags
across five platform workflows.

**Atlas is the reference for the fix, not a victim of it**: it already has no
`appleboy/*` at all - `.github/actions/tailnet-ssh-connect` plus native
`ssh`/`scp` - which is the standard's own stated remedy applied to the
credential path.

**Recovery**: blocked on platform#188 settling the rule. Then convert the four
`docker/*` and Sonar references to SHAs. Do not fix this locally first - a
product repo diverging upward is what created the three-posture mess this
entry describes.

## TD-027

**Wrong**: Atlas has never been analysed by Sonar. Every run of `sonar.yml`
since the repo split has failed at the first network call -

```
ERROR Failed to query JRE metadata: GET https://api.sonarcloud.io/analysis/jres
      failed with HTTP 403 Forbidden. Please check ... SONAR_TOKEN.
INFO  EXECUTION FAILURE
```

- and reported **success**, because the step carried `continue-on-error: true`.
The scanner never started, so there is no partial analysis either.

**Not an atlas problem**: `SONAR_TOKEN` is an org secret (visibility ALL,
created 2026-07-14) and `vxture-platform`'s own Sonar job fails with the byte-
identical 403. The token is rejected outright, org-wide. The stopgap comment in
`sonar.yml` blamed a missing `atlas` project binding; that diagnosis was wrong,
and the flag is what kept it from being caught.

**Second, separate defect**: the SonarCloud GitHub App still runs *automatic*
analysis for this repo under `vxture_Model-Cortex` - the pre-Atlas codename,
deprecated 2026-07-24. It reports on every PR (cancelled/failed) and is the only
Sonar analysis attached to this repo. `sonar.yml` was written to supersede it;
the supersession never happened because the replacement never ran.

**Fixed here**: `continue-on-error` removed. The job is now honestly red. It is
not one of the five required checks, so it blocks nothing - it is red so the gap
is visible rather than disguised, which is the failure this entry is about.

**Recovery** - all three steps are owner actions on sonarcloud.io, outside this
repo's write scope, and none can be done from CI:

1. Issue a valid token for org `vx-6b309295f6500aba6b2a71a29ee27de77fa41583`
   and replace the org secret `SONAR_TOKEN`.
2. Turn off Automatic Analysis for `vxture-atlas`, so the app stops reporting
   under the stale key and competing with the explicit scan.
3. Delete or archive the `vxture_Model-Cortex` project.

Reported to the platform line as `vxture/vxture-platform#189` (the token is
org-level, so the fix is one action for every repo).
