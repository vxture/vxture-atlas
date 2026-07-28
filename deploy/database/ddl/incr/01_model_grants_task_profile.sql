-- 01_model_grants_task_profile.sql - adds model.model_grants.task_profile
-- (docs/70-workplan, TD-003b) to an already-initialized production database.
--
-- Why this exists separately from 00_baseline.sql: 00_baseline.sql's
-- CREATE TABLE IF NOT EXISTS is a no-op against a table that already exists -
-- it does not retroactively add newly-declared columns. This ADD COLUMN
-- IF NOT EXISTS is the actual mechanism that reaches an already-provisioned
-- database (db-init.yml's documented "incr/ increments" step).
--
-- Root cause this closes: the column was added to 00_baseline.sql's table
-- definition in the same PR that shipped the taskProfile feature (TD-003b),
-- but no incremental migration was authored alongside it - so the feature
-- shipped and deployed with no working column behind it. Found via karda's
-- real end-to-end test against production (vxture-atlas#47): every
-- model_grants query failed with "column model_grants.task_profile does not
-- exist". Idempotent - safe to re-run.

ALTER TABLE model.model_grants
  ADD COLUMN IF NOT EXISTS task_profile varchar(64);

CREATE INDEX IF NOT EXISTS idx_model_grants_task_profile
  ON model.model_grants (task_profile);

-- Column-lock grant (98_column_locks.sql's base whitelist deliberately omits
-- this column - see the comment there). The table's UPDATE lockdown already
-- happened in 98_column_locks.sql; this only adds the one extra column to the
-- whitelist. GRANT is naturally idempotent (re-granting is a safe no-op).
GRANT UPDATE (task_profile) ON model.model_grants TO atlas_svc;
