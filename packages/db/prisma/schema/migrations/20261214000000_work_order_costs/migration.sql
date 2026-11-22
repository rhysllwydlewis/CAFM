-- AlterTable
ALTER TABLE "work_order" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'GBP',
ADD COLUMN     "nte_minor" INTEGER;

-- CreateTable
CREATE TABLE "work_order_cost" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "labour_type" TEXT,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "quantity_milli" INTEGER NOT NULL,
    "unit_cost_minor" INTEGER NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "incurred_on" DATE NOT NULL,
    "recorded_by_id" UUID,
    "over_nte" BOOLEAN NOT NULL DEFAULT false,
    "over_nte_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_cost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_cost_tenant_id_work_order_id_created_at_id_idx" ON "work_order_cost"("tenant_id", "work_order_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_cost_tenant_id_id_key" ON "work_order_cost"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "work_order_cost" ADD CONSTRAINT "work_order_cost_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_cost" ADD CONSTRAINT "work_order_cost_tenant_id_work_order_id_fkey" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_order"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_cost" ADD CONSTRAINT "work_order_cost_tenant_id_recorded_by_id_fkey" FOREIGN KEY ("tenant_id", "recorded_by_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS: separate read and write policies, as for every tenant-owned table.
ALTER TABLE "work_order_cost" ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_order_cost_read ON "work_order_cost" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_cost_insert ON "work_order_cost" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_cost_update ON "work_order_cost" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_cost_delete ON "work_order_cost" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Money is whole minor units. The database refuses what the API never produces.
ALTER TABLE work_order
  ADD CONSTRAINT work_order_currency_valid CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT work_order_nte_valid CHECK (nte_minor IS NULL OR nte_minor BETWEEN 0 AND 1000000000);

ALTER TABLE work_order_cost
  ADD CONSTRAINT work_order_cost_kind_valid CHECK (kind IN ('labour', 'parts', 'subcontract', 'expense')),
  ADD CONSTRAINT work_order_cost_labour_valid CHECK ((kind = 'labour') = (labour_type IS NOT NULL)),
  ADD CONSTRAINT work_order_cost_labour_type_valid CHECK (labour_type IS NULL OR labour_type IN ('on_site', 'travel', 'overtime')),
  ADD CONSTRAINT work_order_cost_amounts_valid CHECK (quantity_milli > 0 AND unit_cost_minor >= 0 AND amount_minor BETWEEN 0 AND 1000000000),
  ADD CONSTRAINT work_order_cost_override_valid CHECK (over_nte = (over_nte_reason IS NOT NULL)),
  ADD CONSTRAINT work_order_cost_text_valid CHECK (length(btrim(description)) > 0 AND length(description) <= 200 AND (reference IS NULL OR length(reference) <= 80));
