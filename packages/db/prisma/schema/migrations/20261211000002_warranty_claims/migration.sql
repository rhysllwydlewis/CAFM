-- CreateTable
CREATE TABLE "warranty_claim" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warranty_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "filed_on" DATE NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "warranty_claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warranty_claim_tenant_id_warranty_id_reference_key" ON "warranty_claim"("tenant_id", "warranty_id", "reference");

-- AddForeignKey
ALTER TABLE "warranty_claim" ADD CONSTRAINT "warranty_claim_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claim" ADD CONSTRAINT "warranty_claim_tenant_id_warranty_id_fkey" FOREIGN KEY ("tenant_id", "warranty_id") REFERENCES "asset_warranty"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "warranty_claim" ENABLE ROW LEVEL SECURITY;
CREATE POLICY warranty_claim_read ON "warranty_claim" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY warranty_claim_insert ON "warranty_claim" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY warranty_claim_update ON "warranty_claim" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY warranty_claim_delete ON "warranty_claim" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));
ALTER TABLE "warranty_claim" ADD CONSTRAINT warranty_claim_status_check CHECK (status IN ('submitted', 'accepted', 'rejected', 'closed'));
