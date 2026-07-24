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

REVOKE UPDATE ON model.models FROM atlas_svc;
GRANT UPDATE (provider_id, model_name, description, description_key, endpoint_url,
              context_window, max_output_tokens, capabilities, supports_streaming,
              is_active, is_customer_visible, is_workforce_visible, sort, config,
              updated_by, updated_at, deleted_at)
  ON model.models TO atlas_svc;

-- model_grants: model_id / tenant_id / application_id / application_type are the
-- grant's identity - changing any of them would silently re-point an existing
-- grant at a different model/tenant/application rather than creating a new one.
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
