-- AlterTable
ALTER TABLE "membership" ADD COLUMN     "location_scoped" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "location" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "custom" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_path" (
    "tenant_id" UUID NOT NULL,
    "ancestor_id" UUID NOT NULL,
    "descendant_id" UUID NOT NULL,

    CONSTRAINT "location_path_pkey" PRIMARY KEY ("tenant_id","ancestor_id","descendant_id")
);

-- CreateTable
CREATE TABLE "membership_site" (
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,

    CONSTRAINT "membership_site_pkey" PRIMARY KEY ("tenant_id","membership_id","location_id")
);

-- CreateIndex
CREATE INDEX "location_tenant_id_parent_id_idx" ON "location"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "location_tenant_id_kind_idx" ON "location"("tenant_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "location_tenant_id_id_key" ON "location"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "location_tenant_id_code_key" ON "location"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "location_path_tenant_id_descendant_id_idx" ON "location_path"("tenant_id", "descendant_id");

-- CreateIndex
CREATE INDEX "membership_site_tenant_id_location_id_idx" ON "membership_site"("tenant_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tenant_id_id_key" ON "membership"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "location"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_path" ADD CONSTRAINT "location_path_tenant_id_ancestor_id_fkey" FOREIGN KEY ("tenant_id", "ancestor_id") REFERENCES "location"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_path" ADD CONSTRAINT "location_path_tenant_id_descendant_id_fkey" FOREIGN KEY ("tenant_id", "descendant_id") REFERENCES "location"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_site" ADD CONSTRAINT "membership_site_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "membership"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_site" ADD CONSTRAINT "membership_site_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "location"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The application always sets a transaction-local tenant before reading or writing.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['location', 'location_path', 'membership_site'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_delete', t);
  END LOOP;
END
$$;

ALTER TABLE "location" ADD CONSTRAINT "location_distinct_parent" CHECK (id <> parent_id);
