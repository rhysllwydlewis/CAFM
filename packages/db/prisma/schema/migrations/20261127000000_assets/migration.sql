-- CreateTable
CREATE TABLE "asset_class" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "scheme" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "asset_class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "parent_id" UUID,
    "class_id" UUID,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_service',
    "make" TEXT,
    "model" TEXT,
    "serial" TEXT,
    "installed_on" DATE,
    "supplier" TEXT,
    "expected_life_years" INTEGER,
    "replacement_cost_minor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "criticality" TEXT NOT NULL DEFAULT 'medium',
    "condition" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "custom" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_class_tenant_id_group_idx" ON "asset_class"("tenant_id", "group");

-- CreateIndex
CREATE UNIQUE INDEX "asset_class_tenant_id_id_key" ON "asset_class"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_class_tenant_id_scheme_code_key" ON "asset_class"("tenant_id", "scheme", "code");

-- CreateIndex
CREATE INDEX "asset_tenant_id_location_id_idx" ON "asset"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "asset_tenant_id_parent_id_idx" ON "asset"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "asset_tenant_id_class_id_idx" ON "asset"("tenant_id", "class_id");

-- CreateIndex
CREATE INDEX "asset_tenant_id_status_idx" ON "asset"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_tenant_id_id_key" ON "asset"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_tenant_id_number_key" ON "asset"("tenant_id", "number");

-- AddForeignKey
ALTER TABLE "asset_class" ADD CONSTRAINT "asset_class_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "location"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "asset"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id", "class_id") REFERENCES "asset_class"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The application always sets a transaction-local tenant before reading or writing.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['asset_class', 'asset'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_delete', t);
  END LOOP;
END
$$;

-- The API validates all of this; the database refuses what slips past it.
ALTER TABLE "asset" ADD CONSTRAINT "asset_distinct_parent" CHECK (id <> parent_id);
ALTER TABLE "asset" ADD CONSTRAINT "asset_status_check"
  CHECK (status IN ('in_service', 'out_of_service', 'alarm', 'spare', 'decommissioned'));
ALTER TABLE "asset" ADD CONSTRAINT "asset_criticality_check"
  CHECK (criticality IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE "asset" ADD CONSTRAINT "asset_condition_check" CHECK (condition IS NULL OR condition IN ('A', 'B', 'C', 'D'));
ALTER TABLE "asset" ADD CONSTRAINT "asset_cost_check" CHECK (replacement_cost_minor IS NULL OR replacement_cost_minor >= 0);
ALTER TABLE "asset" ADD CONSTRAINT "asset_life_check" CHECK (expected_life_years IS NULL OR expected_life_years > 0);
ALTER TABLE "asset" ADD CONSTRAINT "asset_currency_check" CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE "asset_class" ADD CONSTRAINT "asset_class_scheme_check"
  CHECK (scheme IN ('uniclass', 'nrm', 'sfg20', 'custom'));
