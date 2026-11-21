-- Application role: logs in, owns nothing, cannot bypass row-level security.
-- Migrations run as the owner role (cafm); the app connects as cafm_app.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cafm_app') THEN
    CREATE ROLE cafm_app LOGIN PASSWORD 'cafm_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;
