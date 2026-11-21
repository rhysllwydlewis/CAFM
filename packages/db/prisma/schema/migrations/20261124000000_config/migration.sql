-- CreateTable
CREATE TABLE "field_definition" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "help_text" TEXT,
    "options" JSONB,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "max_length" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "field_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequence" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "number_sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_version" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "created_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_definition_tenant_id_entity_type_key_key" ON "field_definition"("tenant_id", "entity_type", "key");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequence_tenant_id_key_key" ON "number_sequence"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "config_version_tenant_id_kind_entity_id_version_key" ON "config_version"("tenant_id", "kind", "entity_id", "version");

-- AddForeignKey
ALTER TABLE "field_definition" ADD CONSTRAINT "field_definition_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequence" ADD CONSTRAINT "number_sequence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_version" ADD CONSTRAINT "config_version_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security: the same read/write pattern for each new tenant table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['field_definition', 'number_sequence', 'config_version'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_delete', t);
  END LOOP;
END
$$;

-- Configuration history is append-only for the app, like the audit log.
REVOKE UPDATE, DELETE ON "config_version" FROM cafm_app;
