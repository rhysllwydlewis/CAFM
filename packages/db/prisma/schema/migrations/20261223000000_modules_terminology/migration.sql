-- CreateTable
CREATE TABLE "module_setting" (
    "tenant_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "position" INTEGER,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "module_setting_pkey" PRIMARY KEY ("tenant_id","module_key")
);

-- CreateTable
CREATE TABLE "term_override" (
    "tenant_id" UUID NOT NULL,
    "term_key" TEXT NOT NULL,
    "singular" TEXT NOT NULL,
    "plural" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "term_override_pkey" PRIMARY KEY ("tenant_id","term_key")
);

-- AddForeignKey
ALTER TABLE "module_setting" ADD CONSTRAINT "module_setting_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_override" ADD CONSTRAINT "term_override_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- The application always sets a transaction-local tenant before reading or writing.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['module_setting', 'term_override'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_delete', t);
  END LOOP;
END
$$;
