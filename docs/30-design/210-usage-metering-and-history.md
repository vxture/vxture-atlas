# Usage metering and request history: platform / Atlas boundary

Which side **provides** and **stores** what, for usage accounting and detailed
per-request history across workspace / product / user.

Upstream authority (do not restate contradictions here, fix them there first):
`vxture-platform` `docs/30-design/data_commerce_200_metering.md` (metering
kernel, v1 draft) and `data_platform_100_architecture.md` §2.2.4 (the eight
iron rules, incl. boundary #1 cross-database no-FK).

Status: boundary analysis, 2026-07-28. The split described here is **already
designed on both sides and already has physical tables on both sides** - what
is missing is the code that writes them (see §5).

## 1. The two layers, and why they are two

| | Platform `metering.*` | Atlas `reqlog.*` |
|---|---|---|
| Purpose | money: quota balance, billing basis | operations/analytics: what actually happened |
| Grain | `(workspace, product, metric_key)` | one row per request |
| Cardinality | bounded - a handful of metrics per workspace/product | unbounded - every inference call |
| Dimensions | workspace, product, metric | + user, model, provider, application, agent, feature |
| Correctness bar | financial (append-only enforced by trigger, idempotent, single-transaction) | best-effort observability |
| Owner of writes | the platform's `consume` service, exclusively | Atlas |

They are separate because they answer different questions and have different
failure tolerances. Billing must stay correct even if Atlas's database is
unavailable, so the billing kernel cannot depend on Atlas's tables (boundary
#1: cross-database, no FK). Conversely, per-request model-level rows would
swamp a billing kernel whose whole design premise is bounded cardinality.

There is also a vocabulary reason: `model_code` / `provider_code` /
prompt-vs-completion token split are Atlas's domain language. The platform
deliberately does not learn them - it sees only a `metric_key` and an amount.

## 2. Platform side - what it provides and stores

Per `data_commerce_200_metering.md`:

- **`metering.quota_pools`** - real-time balance, source of truth. Atlas reads
  it for the quota gate (§4.1 period-aware expression) and **never writes it**.
- **`metering.usage_events`** (+ `usage_event_pools`) - append-only, monthly
  partitioned. Columns: `workspace_id`, `product_id`, `metric_key`,
  `total_amount`, `requested_amount`, `idempotency_key`, `request_id`.
  Note what is deliberately absent: **no `user_id`, no model/provider, no
  token split**. The cost centre is the workspace, not the person.
- **`metering.usage_idempotencies`** - global uniqueness (non-partitioned, so
  the PK actually holds); cross-month retries do not double-charge.
- **`metering.usage_summary_{hours,days,weeks,months,years}`** - the staged
  downsampling the owner asked about: a job rolls
  `events -> hours -> days -> weeks/months/years`, retention widening per tier
  (~3mo / ~13mo / ~2y / ~5y / long), expiry by batch or partition DROP.
  **Explicitly never a billing basis** - billing sums `usage_events` over the
  subscription-anchored window.
- **`POST /usage/consume`** - the sole write path. Single transaction:
  idempotency claim -> lock candidate pools -> lazy period reset -> atomic or
  waterfall deduction -> update pools -> insert event head + per-pool detail.
  Products, Atlas included, **must not write the usage tables directly**.

## 3. Atlas side - what it provides and stores

`reqlog.request_records` (already in `deploy/database/ddl/00_baseline.sql`,
deployed, monthly `PARTITION BY RANGE (created_at)`) is exactly the detailed
history layer:

- Attribution: `tenant_id`, `workspace_id`, `product_id`, **`user_id`**,
  `application_id`, `application_type`, `agent_id`, `feature_id`,
  `downstream_identity_hash`
- Atlas domain facts: `model_code`, `provider_code`, `input_tokens`,
  `output_tokens`, `total_tokens`, `latency_ms`, `usage_type`
  (normal/retry/test), `status` (success/error/timeout)
- Billing correlation: `billed_metric_key`, `billed_amount`, `usage_event_id`
  (bare cross-database reference to the platform's `usage_events.id`, no FK),
  `request_id` (the correlation key both sides carry)

`reqlog.error_records` is the failure-side companion (`error_code`,
`error_message`, `provider_code`, `model_code`).

**`user_id` lives only here.** The platform's metering has no user dimension
by design, so "which user burned what" is answerable only from Atlas. That is
the correct home for it - it is an operational/analytical question, not a
billing one - but it means Atlas's history is not optional if per-user
reporting is a product requirement.

## 4. How the two join

`request_id` is generated per call and written to both sides;
`usage_event_id` is the platform's event id echoed back into Atlas's row.
Neither is an FK (boundary #1). So:

- "what did workspace W spend this cycle" -> platform, authoritative
- "which model/user/agent produced that spend" -> Atlas, joined on
  `request_id` / `usage_event_id`
- A row present in Atlas with `usage_event_id IS NULL` means the consume call
  did not land - which is precisely the reconciliation signal that makes the
  split safe to operate.

## 5. Current state: designed on both sides, written on neither

- Atlas's `MeteringService.record()` calls
  `ModelRegistryRepository.recordUsage()`, which logs a warning and returns
  `null`. **Nothing is persisted, to either side.** `upsertUsageSummary()`
  likewise returns an in-memory projection.
- `RequestRecord` exists as a Prisma model with a generated delegate; no
  application code calls it.
- No `POST /usage/consume` client exists in Atlas. `PLATFORM_API_URL` is
  declared in `.env.example` and read by zero lines of code.
- The quota gate therefore fail-opens on every request in production
  (`activeQuotas: 0`), and `/capability/usage-summaries` reads a table with no
  writer.

Consequence, stated plainly: Atlas is designated the sole inference-metering
entry point for every vxture product, and it currently records nothing
anywhere. See TD-002 / TD-016 / TD-017.

## 6. Lifecycle / retention

- Platform: monthly partitions on `usage_events(_pools)`; tiered summary
  retention with expiry by partition DROP (§2 above).
- Atlas: **retention is 6 months** (owner decision 2026-07-28). Rationale:
  twice the platform's finest summary tier (`usage_summary_hours`, ~3 months),
  so cross-quarter reconciliation and incident lookback both work, while
  staying bounded - this is one row per request, not a rollup. It is
  deliberately shorter than the platform's tiers: operational detail, not a
  financial record, and the higher-volume of the two.
- Mechanism (TD-018): `reqlog.ensure_partitions(months_ahead)` and
  `reqlog.drop_expired_partitions(retain_months, dry_run)` in
  `deploy/database/ddl/incr/02_reqlog_partition_maintenance.sql`. Applying
  that file installs both and extends the runway 12 months, so a db-init run
  is itself a complete maintenance pass. Expiry is never invoked implicitly -
  dropping data is a separate, deliberate call with `dry_run=false`.
- **Why db-init and not a cron/in-app job**: creating a partition is a DDL
  structure change, and `140-repo-governance-standard.md` §6 makes db-init
  (`confirm=yes` + `expected_sha` + production approval) the sole sanctioned
  path - "常规部署链不跑 migration/seed，DB 结构/数据变更是独立授权动作". An
  in-app scheduler would make the application itself an unaudited
  structure-change path. That the standard has no sanctioned *recurring*
  maintenance path is a real gap, raised with the platform line rather than
  worked around locally (see TD-018).
- **The silence is the defect, so it is now loud**: `/readyz` carries a
  `reqlogPartitions` check reporting `monthsAhead` (warn below 2) and
  `defaultPartitionRows` (fail above 0 - rows there mean retention is already
  broken, not merely about to be). Running out of runway can no longer pass
  unnoticed.
