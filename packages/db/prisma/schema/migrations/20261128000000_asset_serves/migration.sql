-- CreateTable
CREATE TABLE "asset_serves" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "location_id" UUID,
    "served_asset_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_serves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_serves_tenant_id_location_id_idx" ON "asset_serves"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "asset_serves_tenant_id_served_asset_id_idx" ON "asset_serves"("tenant_id", "served_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_serves_tenant_id_asset_id_location_id_key" ON "asset_serves"("tenant_id", "asset_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_serves_tenant_id_asset_id_served_asset_id_key" ON "asset_serves"("tenant_id", "asset_id", "served_asset_id");

-- AddForeignKey
ALTER TABLE "asset_serves" ADD CONSTRAINT "asset_serves_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_serves" ADD CONSTRAINT "asset_serves_tenant_id_asset_id_fkey" FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "asset"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_serves" ADD CONSTRAINT "asset_serves_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "location"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_serves" ADD CONSTRAINT "asset_serves_tenant_id_served_asset_id_fkey" FOREIGN KEY ("tenant_id", "served_asset_id") REFERENCES "asset"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The application always sets a transaction-local tenant before reading or writing.
ALTER TABLE "asset_serves" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_serves_read ON "asset_serves" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_serves_insert ON "asset_serves" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_serves_update ON "asset_serves" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_serves_delete ON "asset_serves" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Each row names exactly one thing served, and an asset never serves itself.
ALTER TABLE "asset_serves" ADD CONSTRAINT "asset_serves_one_target"
  CHECK (num_nonnulls(location_id, served_asset_id) = 1);
ALTER TABLE "asset_serves" ADD CONSTRAINT "asset_serves_not_self" CHECK (asset_id <> served_asset_id);
