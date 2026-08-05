-- Column-level UPDATE whitelist (governance section 7). REVOKE table UPDATE, then
-- GRANT only the writable columns. Anchor columns (id, *_id reference keys,
-- created_at, and identity/provenance columns) are never writable. Append-only
-- tables get no UPDATE at all. Adding a writable column requires updating this
-- whitelist, or the service write fails with permission denied.

-- --- key ---
-- provider_api_keys: rotation updates the ciphertext + key-ref in place; the
-- key's identity (provider_code, key_alias) is immutable - a rename is a new key.
REVOKE UPDATE ON key.provider_api_keys FROM atlas_svc;
GRANT UPDATE (encrypted_key, encryption_key_id, key_scope, is_active, last_rotated_at, updated_at)
  ON key.provider_api_keys TO atlas_svc;

-- key_rotation_logs: append-only rotation audit -> no UPDATE.
REVOKE UPDATE ON key.key_rotation_logs FROM atlas_svc;

-- --- reqlog ---
-- request_records / error_records: append-only (cleanup is DROP PARTITION, not
-- row DELETE or UPDATE) -> no UPDATE at all.
REVOKE UPDATE ON reqlog.request_records FROM atlas_svc;
REVOKE UPDATE ON reqlog.error_records FROM atlas_svc;

-- --- routing ---
REVOKE UPDATE ON routing.provider_configs FROM atlas_svc;
GRANT UPDATE (endpoint_url, timeout_ms, retry_policy, is_active, deleted_at, updated_at)
  ON routing.provider_configs TO atlas_svc;

REVOKE UPDATE ON routing.model_routes FROM atlas_svc;
GRANT UPDATE (weight, is_active, deleted_at, updated_at)
  ON routing.model_routes TO atlas_svc;

REVOKE UPDATE ON routing.fallback_rules FROM atlas_svc;
GRANT UPDATE (fallback_model_codes, condition, is_active, deleted_at, updated_at)
  ON routing.fallback_rules TO atlas_svc;

-- --- model (authority = docs/design/data_model_200_schema.md section 1, platform repo) ---
-- provider_code / model_code are the visible-code identity - never writable;
-- renaming one is a new provider/model, not an edit.
REVOKE UPDATE ON model.model_providers FROM atlas_svc;
GRANT UPDATE (provider_name, description, description_key, logo_url, homepage_url,
              console_url, billing_url, is_active, is_customer_visible,
              is_workforce_visible, config, updated_by, updated_at, deleted_at)
  ON model.model_providers TO atlas_svc;

-- models: the writable set is a rule, not a list. A column belongs to exactly
-- one of four groups, and the group decides.
--
--   identity        model_code - never writable, AND never reusable. Deleting a
--                   model is a soft delete, and uq_models_model_code is a plain
--                   UNIQUE (not partial), so a deleted code stays taken forever.
--                   That is deliberate: reqlog.request_records / error_records
--                   and the routing.* tables reference a model by model_code as
--                   plain text with no FK, so re-issuing a retired code would
--                   silently re-attribute months of retained usage history to a
--                   different model.
--   upstream binding provider_id, endpoint_url, protocol, config - writable AS A
--                   SET. They answer one question ("which upstream, reached how")
--                   and repointing a model at a new upstream routinely means
--                   changing several of them at once. Locking any one of them
--                   makes a mis-onboarded model unrepairable - and because the
--                   identity rule above forbids recreating it under the same
--                   code, unrepairable means gone. `protocol` was missing from
--                   this set until 2026-08-06 (TD-025); it was an omission from
--                   before protocol became the dispatch key, not a decision.
--                   Garbage input is kept out at the write path instead, where
--                   the error is legible: the admin API validates protocol
--                   against the closed vocabulary and config.wire against its
--                   schema, and POST /capability/models/:id/probe verifies the
--                   change against the real upstream.
--   presentation    model_name, description*, capabilities, context_window,
--                   max_output_tokens, supports_streaming, *_visible, sort.
--   lifecycle       is_active, deleted_at, updated_by, updated_at.
--
-- model_type is in none of them: it selects which capability contract the model
-- answers (chat / embedding / rerank), so changing it turns the row into a
-- different kind of thing while its grants and price rules stay pointed at it.
REVOKE UPDATE ON model.models FROM atlas_svc;
GRANT UPDATE (provider_id, endpoint_url, protocol, config,
              model_name, description, description_key, capabilities,
              context_window, max_output_tokens, supports_streaming,
              is_customer_visible, is_workforce_visible, sort,
              is_active, deleted_at, updated_by, updated_at)
  ON model.models TO atlas_svc;

-- model_grants: model_id / tenant_id / application_id / application_type are the
-- grant's identity - changing any of them would silently re-point an existing
-- grant at a different model/tenant/application rather than creating a new one.
-- task_profile intentionally NOT in this base whitelist: on an already-existing
-- production table (00_baseline.sql's CREATE TABLE IF NOT EXISTS is a no-op
-- there), granting UPDATE on a column that doesn't exist yet would fail before
-- incr/ ever runs to add it - same hazard as the index in 00_baseline.sql, see
-- that file's comment. Granted instead by
-- deploy/database/ddl/incr/01_model_grants_task_profile.sql, right after its
-- ALTER TABLE ADD COLUMN, which is safe for both a fresh install (runs after
-- CREATE TABLE) and an existing one (runs after the ALTER TABLE).
-- ORDER MATTERS BOTH WAYS: the REVOKE below strips that increment's grant, so
-- re-running this file ALONE silently removes task_profile from the writable
-- set. db-init.yml applies 98 before incr/, which is what keeps it correct -
-- do not "just re-apply the column locks" by hand.
REVOKE UPDATE ON model.model_grants FROM atlas_svc;
GRANT UPDATE (priority, is_active, reason, expires_at, updated_by, updated_at, deleted_at)
  ON model.model_grants TO atlas_svc;

-- model_price_rules: versioned by append (new row + expires_at on the old one),
-- not in-place value edits - only the lifecycle columns are writable.
REVOKE UPDATE ON model.model_price_rules FROM atlas_svc;
GRANT UPDATE (is_active, expires_at, updated_by, updated_at)
  ON model.model_price_rules TO atlas_svc;

REVOKE UPDATE ON model.model_policies FROM atlas_svc;
GRANT UPDATE (name, priority, max_concurrent, rate_limit_rpm, rate_limit_tpm,
              rate_limit_tpd, max_context_tokens, is_active, expires_at,
              updated_by, updated_at)
  ON model.model_policies TO atlas_svc;

-- --- provisioning ---
-- workspace_provisionings: upserted on every valid webhook event - status/seq/
-- timestamps are writable, identity (workspace_id, product_code) and created_at
-- are not (a change there would silently re-point the row at a different
-- workspace rather than recording a new event for the same one).
REVOKE UPDATE ON provisioning.workspace_provisionings FROM atlas_svc;
GRANT UPDATE (status, seq, provisioned_at, deprovisioned_at, updated_at)
  ON provisioning.workspace_provisionings TO atlas_svc;

-- webhook_deliveries: append-only idempotency ledger -> no UPDATE at all.
REVOKE UPDATE ON provisioning.webhook_deliveries FROM atlas_svc;
