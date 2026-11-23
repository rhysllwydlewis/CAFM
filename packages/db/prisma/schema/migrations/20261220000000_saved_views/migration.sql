
-- CreateTable
CREATE TABLE "saved_view" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saved_view_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_view_tenant_id_entity_visibility_idx" ON "saved_view"("tenant_id", "entity", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "saved_view_tenant_id_id_key" ON "saved_view"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_view_tenant_id_owner_id_entity_name_key" ON "saved_view"("tenant_id", "owner_id", "entity", "name");

-- AddForeignKey
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_tenant_id_owner_id_fkey" FOREIGN KEY ("tenant_id", "owner_id") REFERENCES "membership"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS: separate read and write policies, as for every tenant-owned table.
ALTER TABLE "saved_view" ENABLE ROW LEVEL SECURITY;
CREATE POLICY saved_view_read ON "saved_view" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY saved_view_insert ON "saved_view" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY saved_view_update ON "saved_view" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY saved_view_delete ON "saved_view" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));
