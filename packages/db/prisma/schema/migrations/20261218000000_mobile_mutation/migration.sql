
-- CreateTable
CREATE TABLE "mobile_mutation" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "key" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "result" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_mutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mobile_mutation_tenant_id_member_id_key_key" ON "mobile_mutation"("tenant_id", "member_id", "key");

-- AddForeignKey
ALTER TABLE "mobile_mutation" ADD CONSTRAINT "mobile_mutation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_mutation" ADD CONSTRAINT "mobile_mutation_tenant_id_member_id_fkey" FOREIGN KEY ("tenant_id", "member_id") REFERENCES "membership"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS: separate read and write policies, as for every tenant-owned table.
ALTER TABLE "mobile_mutation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY mobile_mutation_read ON "mobile_mutation" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY mobile_mutation_insert ON "mobile_mutation" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY mobile_mutation_update ON "mobile_mutation" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY mobile_mutation_delete ON "mobile_mutation" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE mobile_mutation
  ADD CONSTRAINT mobile_mutation_outcome_valid CHECK (outcome IN ('applied', 'rejected')),
  ADD CONSTRAINT mobile_mutation_kind_valid CHECK (kind IN ('status', 'note', 'checklist_answer', 'meter_reading'));
