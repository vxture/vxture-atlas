-- Least-privilege service role (data_platform_100 section 2.2.4 / governance
-- section 7). The runtime connects as atlas_svc, NOT the DB owner.
-- SELECT/INSERT/DELETE on the four schemas; NO DDL; NO blanket UPDATE
-- (column-level UPDATE is granted per the whitelist in 98_column_locks.sql).
-- The password is injected at bootstrap (never in the repo).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_svc') THEN
    CREATE ROLE atlas_svc LOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA key, reqlog, routing, model TO atlas_svc;

GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA key, reqlog, routing, model
  TO atlas_svc;
