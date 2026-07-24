-- ═══════════════════════════════════════════════════════════════════════════
-- 00_baseline.sql — Atlas DB baseline (vxturestudio_modelruntime_main)
-- Single-file DDL baseline, per the org product-repo DDL convention
-- (00_baseline + 97_service_role + 98_column_locks + incr/, product_240
-- section 2.4 E). Assembled from the pre-existing modelruntime DDL design in
-- vxture-platform (deploy/database/ddl-modelruntime/*.sql) plus the model.*
-- tables migrated out of the shared platform DB (originally
-- deploy/database/ddl/60_model.sql there) - see the Atlas repo-split plan,
-- Phase 2.
--
-- Four schemas, ALL physically isolated from the shared platform DB
-- (vxturestudio_platform_main) - zero cross-database FK (boundary #1).
-- Cross-database references are loose values (request_id, provider_code,
-- model_code, tenant_id) validated at the application layer via the C2/C3
-- network contract, never a DB constraint:
--   key     - provider API keys (AES-256-GCM ciphertext only, plaintext never
--             leaves this schema)
--   reqlog  - high-frequency AI request/error logs, monthly RANGE partitions,
--             append-only
--   routing - connection/routing/fallback config
--   model   - provider/model/grant/price_rule/policy registry (Atlas's own
--             product data - moved here from the platform's `model` schema)
--
-- Design authority: docs/design/data_model_200_schema.md section 4 (platform
-- repo). Prisma schema (service/prisma/schema.prisma) is a client-generation
-- source only and MUST stay in lockstep with this file
-- (scripts/guardrails/check-data-architecture.mjs).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS key;      -- provider secrets (AES-256 ciphertext, plaintext never leaves this schema)
CREATE SCHEMA IF NOT EXISTS reqlog;   -- high-frequency AI request logs / error detail (monthly RANGE partitions, append-only)
CREATE SCHEMA IF NOT EXISTS routing;  -- connection / routing / fallback config
CREATE SCHEMA IF NOT EXISTS model;    -- model governance config (provider/model/grant/price_rule/policy)

-- ═══ schema key ═══
-- Provider API key vault. Never store plaintext keys - only AES-256-GCM
-- ciphertext (encrypted_key bytea). Envelope encryption model:
--   encrypted_key      = nonce||ciphertext||auth-tag packed AES-256-GCM blob
--   encryption_key_id  = key-ref to the wrapping master key (KMS/DEK) version,
--                        not the key itself - allows master-key rotation
--                        without re-reading plaintext.
-- provider_code is a cross-database logical reference (no FK, boundary #1).
CREATE TABLE key.provider_api_keys (
    id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_code     varchar(64)   NOT NULL,                     -- cross-db logical ref to model.model_providers.provider_code (no FK)
    key_alias         varchar(128)  NOT NULL,                     -- multi-key rotation / disambiguation
    encrypted_key     bytea         NOT NULL,                     -- AES-256 ciphertext (nonce||ciphertext||tag); decrypted in memory only
    encryption_key_id varchar(128)  NOT NULL,                     -- key-ref to the wrapping master key (KMS/DEK) version
    key_scope         varchar(32)   NOT NULL DEFAULT 'shared',    -- shared / dedicated
    is_active         boolean       NOT NULL DEFAULT true,
    last_rotated_at   timestamptz,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_provider_api_keys_code_alias UNIQUE (provider_code, key_alias),
    CONSTRAINT chk_provider_api_keys_key_scope CHECK (key_scope IN ('shared','dedicated'))
);
CREATE INDEX idx_provider_api_keys_provider_code ON key.provider_api_keys (provider_code);
CREATE INDEX idx_provider_api_keys_is_active     ON key.provider_api_keys (is_active);

-- Key-rotation audit (append-only). provider_api_key_id is a domain FK (same
-- database, real FK). rotated_by is a bare value referencing the platform's
-- admin.operator_accounts (cross-database/cross-realm, no FK, boundary #1/#2).
-- Append-only guard in 95_triggers.sql equivalent (see the modelruntime
-- reference implementation) - UPDATE only; DELETE remains for parent-key purge.
CREATE TABLE key.key_rotation_logs (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_api_key_id uuid          NOT NULL REFERENCES key.provider_api_keys(id) ON DELETE CASCADE,
    rotated_by          uuid,                                     -- bare value -> admin.operator_accounts (boundary #1/#2, no FK)
    reason              varchar(512),
    rotated_at          timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX idx_key_rotation_logs_key ON key.key_rotation_logs (provider_api_key_id, rotated_at);

-- ═══ schema reqlog ═══
-- High-frequency AI request log (one row per call) + error detail, monthly
-- RANGE partitions (partition key in the composite PK). Cleanup is via DROP
-- PARTITION, not row DELETE, so there is no updated_at/deleted_at - a row is
-- immutable once written. Cross-database correlation keys (request_id,
-- tenant_id/workspace_id/product_id/user_id/application_id, model_code,
-- provider_code) are bare values, no FK (boundary #1). Failed calls
-- (status=error/timeout) land only here - they never trigger consume or write
-- a usage event on the platform side.
CREATE TABLE reqlog.request_records (
    id                       uuid          NOT NULL DEFAULT gen_random_uuid(),
    request_id               varchar(128)  NOT NULL,             -- cross-db correlation key -> platform metering.usage_events.request_id (no FK)
    tenant_id                uuid,                               -- attribution dimension (cross-db bare value, audit retained)
    workspace_id             uuid,
    product_id                uuid,
    user_id                  uuid,
    application_id           uuid,
    application_type         varchar(32),                        -- agent/workflow/api_client/internal_service
    agent_id                 uuid,
    feature_id               uuid,
    downstream_identity_hash varchar(128),
    model_code               varchar(128),                       -- cross-schema logical ref -> model.models.model_code (no FK, same DB but decoupled by design)
    provider_code            varchar(64),                        -- cross-schema logical ref -> model.model_providers.provider_code (no FK)
    input_tokens             bigint,
    output_tokens            bigint,
    total_tokens             bigint,
    latency_ms               int,
    usage_type               varchar(16),                        -- normal|retry|test
    status                   varchar(32),                        -- success|error|timeout
    business_id              varchar(128),
    billed_metric_key        varchar(64),
    billed_amount            bigint,
    usage_event_id           uuid,                               -- cross-db ref -> platform usage_events.id (no FK, boundary #1)
    created_at               timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at),                                -- partition key must be in the PK
    CONSTRAINT chk_request_records_usage_type CHECK (usage_type IS NULL OR usage_type IN ('normal','retry','test')),
    CONSTRAINT chk_request_records_status     CHECK (status IS NULL OR status IN ('success','error','timeout'))
) PARTITION BY RANGE (created_at);
CREATE INDEX idx_request_records_request_id     ON reqlog.request_records (request_id);
CREATE INDEX idx_request_records_usage_event_id ON reqlog.request_records (usage_event_id);
CREATE INDEX idx_request_records_tenant_id      ON reqlog.request_records (tenant_id);

CREATE TABLE reqlog.error_records (
    id            uuid          NOT NULL DEFAULT gen_random_uuid(),
    request_id    varchar(128),
    provider_code varchar(64),
    model_code    varchar(128),
    error_code    varchar(64),
    error_message text,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX idx_error_records_request_id ON reqlog.error_records (request_id);
CREATE INDEX idx_error_records_error_code ON reqlog.error_records (error_code);

-- Pre-built monthly partitions (current + 6 months ahead, starting 2026-07) +
-- a DEFAULT catch-all so a missed pre-build never silently drops writes. A
-- maintenance job (pg_cron / external scheduler) should roll this forward
-- (create "month after next", detach+drop expired partitions) once deployed.
DO $$
DECLARE
  parts text[] := ARRAY['reqlog.request_records', 'reqlog.error_records'];
  qname text; sch text; tbl text; child text; mn date; nm date; i int;
BEGIN
  FOREACH qname IN ARRAY parts LOOP
    sch := split_part(qname, '.', 1);
    tbl := split_part(qname, '.', 2);
    FOR i IN 0..6 LOOP
      mn := (date '2026-07-01') + (i * interval '1 month');
      nm := mn + interval '1 month';
      child := tbl || '_y' || to_char(mn, 'YYYY') || 'm' || to_char(mn, 'MM');
      IF to_regclass(format('%I.%I', sch, child)) IS NULL THEN
        EXECUTE format(
          'CREATE TABLE %I.%I PARTITION OF %I.%I FOR VALUES FROM (%L) TO (%L)',
          sch, child, sch, tbl, mn, nm);
      END IF;
    END LOOP;
    child := tbl || '_default';
    IF to_regclass(format('%I.%I', sch, child)) IS NULL THEN
      EXECUTE format('CREATE TABLE %I.%I PARTITION OF %I.%I DEFAULT', sch, child, sch, tbl);
    END IF;
  END LOOP;
END $$;

-- ═══ schema routing ═══
-- Connection config, weighted model->provider routing, and fallback rules.
-- provider_code / model_code / fallback_model_codes are cross-schema logical
-- references (no FK; same physical database but deliberately decoupled).
CREATE TABLE routing.provider_configs (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_code varchar(64)   NOT NULL,
    endpoint_url  text          NOT NULL,
    timeout_ms    int,
    retry_policy  jsonb,
    is_active     boolean       NOT NULL DEFAULT true,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    deleted_at    timestamptz,
    CONSTRAINT uq_provider_configs_provider_code UNIQUE (provider_code)
);
CREATE INDEX idx_provider_configs_is_active  ON routing.provider_configs (is_active);
CREATE INDEX idx_provider_configs_deleted_at ON routing.provider_configs (deleted_at);

CREATE TABLE routing.model_routes (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    model_code    varchar(128)  NOT NULL,
    provider_code varchar(64)   NOT NULL,
    weight        int           NOT NULL DEFAULT 100,
    is_active     boolean       NOT NULL DEFAULT true,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    deleted_at    timestamptz,
    CONSTRAINT uq_model_routes_model_provider UNIQUE (model_code, provider_code)
);
CREATE INDEX idx_model_routes_model_code ON routing.model_routes (model_code);
CREATE INDEX idx_model_routes_is_active  ON routing.model_routes (is_active);
CREATE INDEX idx_model_routes_deleted_at ON routing.model_routes (deleted_at);

CREATE TABLE routing.fallback_rules (
    id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    model_code           varchar(128)  NOT NULL,
    fallback_model_codes text[]        NOT NULL DEFAULT '{}',
    condition            varchar(64),
    is_active            boolean       NOT NULL DEFAULT true,
    created_at           timestamptz   NOT NULL DEFAULT now(),
    updated_at           timestamptz   NOT NULL DEFAULT now(),
    deleted_at           timestamptz,
    CONSTRAINT uq_fallback_rules_model_code UNIQUE (model_code)
);
CREATE INDEX idx_fallback_rules_model_code ON routing.fallback_rules (model_code);
CREATE INDEX idx_fallback_rules_is_active  ON routing.fallback_rules (is_active);
CREATE INDEX idx_fallback_rules_deleted_at ON routing.fallback_rules (deleted_at);

-- ═══ schema model ═══
-- Model governance config (provider/model/grant/price_rule/policy) - Atlas's
-- own product data, migrated out of the platform's shared `model` schema.
-- tenant_id on model_grants/model_policies was a real cross-schema FK to
-- tenancy.tenants there; here it is a bare value with NO FK (physical
-- database separation, boundary #1) - consistency is enforced at the
-- application layer against the C2/C3 contract payload, not by the DB.
CREATE TABLE model.model_providers (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_code varchar(64)   NOT NULL,
    provider_type varchar(32)   NOT NULL DEFAULT 'online',
    provider_name varchar(128)  NOT NULL,
    description   varchar(512),
    description_key varchar(128),
    logo_url      text,
    homepage_url  text,
    console_url   text,
    billing_url   text,
    is_active     boolean       NOT NULL DEFAULT true,
    is_customer_visible  boolean      NOT NULL DEFAULT true,
    is_workforce_visible boolean      NOT NULL DEFAULT true,
    config        jsonb,                                        -- non-sensitive connection metadata; keys never live here
    created_by    uuid,                                         -- bare value -> platform admin.operator_accounts (boundary #2, no FK)
    updated_by    uuid,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    deleted_at    timestamptz,
    CONSTRAINT uq_model_providers_provider_code UNIQUE (provider_code),
    CONSTRAINT chk_model_providers_provider_type CHECK (provider_type IN ('online','self_hosted','private'))
);
CREATE INDEX idx_model_providers_is_active ON model.model_providers (is_active);
CREATE INDEX idx_model_providers_type      ON model.model_providers (provider_type);
CREATE INDEX idx_model_providers_deleted_at ON model.model_providers (deleted_at);

CREATE TABLE model.models (
    id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id       uuid          REFERENCES model.model_providers(id) ON DELETE SET NULL,
    model_code        varchar(128)  NOT NULL,
    model_type        varchar(32)   NOT NULL DEFAULT 'chat',   -- chat/embedding/rerank... (open set, no CHECK)
    protocol          varchar(64)   NOT NULL,
    model_name        varchar(128)  NOT NULL,
    description       varchar(512),
    description_key   varchar(128),
    endpoint_url      text          NOT NULL,
    context_window    int,
    max_output_tokens int,
    capabilities      text[]        NOT NULL DEFAULT '{}',
    supports_streaming boolean      NOT NULL DEFAULT true,
    is_active         boolean       NOT NULL DEFAULT true,
    is_customer_visible  boolean      NOT NULL DEFAULT true,
    is_workforce_visible boolean      NOT NULL DEFAULT true,
    sort              int           NOT NULL DEFAULT 999,
    config            jsonb,
    created_by        uuid,
    updated_by        uuid,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    CONSTRAINT uq_models_model_code UNIQUE (model_code)
);
CREATE INDEX idx_models_is_active   ON model.models (is_active);
CREATE INDEX idx_models_model_type  ON model.models (model_type);
CREATE INDEX idx_models_provider_id ON model.models (provider_id);
CREATE INDEX idx_models_deleted_at  ON model.models (deleted_at);

CREATE TABLE model.model_grants (
    id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id         uuid          NOT NULL REFERENCES model.models(id) ON DELETE CASCADE,
    tenant_id        uuid          NOT NULL,                  -- cross-db bare value, app-layer validated (boundary #1, no FK)
    application_id   uuid,
    application_type varchar(32),
    agent_id         uuid,                                    -- [retiring] = application_id WHERE type='agent'
    priority         int           NOT NULL DEFAULT 100,
    is_active        boolean       NOT NULL DEFAULT true,
    reason           varchar(512),
    expires_at       timestamptz,
    created_by       uuid,
    updated_by       uuid,
    created_at       timestamptz   NOT NULL DEFAULT now(),
    updated_at       timestamptz   NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    CONSTRAINT chk_model_grants_application_type
        CHECK (application_type IN ('agent','workflow','api_client','internal_service'))
);
CREATE INDEX idx_model_grants_model            ON model.model_grants (model_id);
CREATE INDEX idx_model_grants_tenant           ON model.model_grants (tenant_id);
CREATE INDEX idx_model_grants_application      ON model.model_grants (application_id);
CREATE INDEX idx_model_grants_application_type ON model.model_grants (application_type);
CREATE INDEX idx_model_grants_agent            ON model.model_grants (agent_id);
CREATE INDEX idx_model_grants_is_active        ON model.model_grants (is_active);

CREATE TABLE model.model_price_rules (
    id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id           uuid          NOT NULL REFERENCES model.models(id) ON DELETE CASCADE,
    billing_mode       varchar(32)   NOT NULL DEFAULT 'token',
    currency           varchar(16)   NOT NULL DEFAULT 'CNY',
    unit_tokens        int           NOT NULL DEFAULT 1000000,
    input_unit_price   numeric(18,8) NOT NULL DEFAULT 0,
    output_unit_price  numeric(18,8) NOT NULL DEFAULT 0,
    request_unit_price numeric(18,8) NOT NULL DEFAULT 0,
    is_active          boolean       NOT NULL DEFAULT true,
    effective_at       timestamptz   NOT NULL DEFAULT now(),
    expires_at         timestamptz,
    created_by         uuid,
    updated_by         uuid,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    updated_at         timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT chk_model_price_rules_billing_mode CHECK (billing_mode IN ('token','request'))
);
CREATE INDEX idx_model_price_rules_model     ON model.model_price_rules (model_id);
CREATE INDEX idx_model_price_rules_effective ON model.model_price_rules (effective_at);
CREATE INDEX idx_model_price_rules_is_active ON model.model_price_rules (is_active);

CREATE TABLE model.model_policies (
    id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id           uuid          NOT NULL REFERENCES model.models(id) ON DELETE CASCADE,
    tenant_id          uuid,                                   -- cross-db bare value (boundary #1, no FK); NULL = platform default
    name               varchar(128),
    priority           int           NOT NULL DEFAULT 100,
    max_concurrent     int,
    rate_limit_rpm     int,
    rate_limit_tpm     bigint,
    rate_limit_tpd     bigint,
    max_context_tokens int,
    is_active          boolean       NOT NULL DEFAULT true,
    effective_at       timestamptz   NOT NULL DEFAULT now(),
    expires_at         timestamptz,
    created_by         uuid,
    updated_by         uuid,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    updated_at         timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_model_policies_model_tenant UNIQUE (model_id, tenant_id)
);
CREATE INDEX idx_model_policies_model     ON model.model_policies (model_id);
CREATE INDEX idx_model_policies_tenant    ON model.model_policies (tenant_id);
CREATE INDEX idx_model_policies_is_active ON model.model_policies (is_active);
