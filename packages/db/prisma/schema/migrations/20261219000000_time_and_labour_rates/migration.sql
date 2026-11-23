
-- AlterTable
ALTER TABLE "work_order_cost" ADD COLUMN     "time_id" UUID;

-- CreateTable
CREATE TABLE "labour_rate" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "labour_type" TEXT NOT NULL,
    "role_key" TEXT NOT NULL DEFAULT '',
    "rate_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labour_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_time" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "labour_type" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "worked_on" DATE NOT NULL,
    "note" TEXT,
    "rate_minor" INTEGER,
    "submission" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_time_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "labour_rate_tenant_id_labour_type_role_key_key" ON "labour_rate"("tenant_id", "labour_type", "role_key");

-- CreateIndex
CREATE INDEX "work_order_time_tenant_id_work_order_id_created_at_id_idx" ON "work_order_time"("tenant_id", "work_order_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_time_tenant_id_id_key" ON "work_order_time"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_time_tenant_id_member_id_submission_key" ON "work_order_time"("tenant_id", "member_id", "submission");

-- AddForeignKey
ALTER TABLE "work_order_cost" ADD CONSTRAINT "work_order_cost_tenant_id_time_id_fkey" FOREIGN KEY ("tenant_id", "time_id") REFERENCES "work_order_time"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_rate" ADD CONSTRAINT "labour_rate_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_time" ADD CONSTRAINT "work_order_time_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_time" ADD CONSTRAINT "work_order_time_tenant_id_work_order_id_fkey" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_order"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_time" ADD CONSTRAINT "work_order_time_tenant_id_member_id_fkey" FOREIGN KEY ("tenant_id", "member_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "labour_rate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY labour_rate_read ON "labour_rate" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY labour_rate_insert ON "labour_rate" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY labour_rate_update ON "labour_rate" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY labour_rate_delete ON "labour_rate" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "work_order_time" ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_order_time_read ON "work_order_time" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_time_insert ON "work_order_time" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_time_update ON "work_order_time" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_time_delete ON "work_order_time" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- The database refuses what the API never produces.
ALTER TABLE labour_rate
  ADD CONSTRAINT labour_rate_type_valid CHECK (labour_type IN ('on_site', 'travel', 'overtime')),
  ADD CONSTRAINT labour_rate_amount_valid CHECK (rate_minor BETWEEN 0 AND 100000000),
  ADD CONSTRAINT labour_rate_currency_valid CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE work_order_time
  ADD CONSTRAINT work_order_time_type_valid CHECK (labour_type IN ('on_site', 'travel', 'overtime')),
  ADD CONSTRAINT work_order_time_minutes_valid CHECK (minutes BETWEEN 1 AND 1440),
  ADD CONSTRAINT work_order_time_rate_valid CHECK (rate_minor IS NULL OR rate_minor BETWEEN 0 AND 100000000),
  ADD CONSTRAINT work_order_time_note_valid CHECK (note IS NULL OR length(note) <= 200);

-- The phone's change queue gains time.
ALTER TABLE mobile_mutation DROP CONSTRAINT mobile_mutation_kind_valid;
ALTER TABLE mobile_mutation
  ADD CONSTRAINT mobile_mutation_kind_valid CHECK (kind IN ('status', 'note', 'checklist_answer', 'meter_reading', 'time'));

-- Built-in roles that do the work can record time, and administrators and finance can set rates.
UPDATE "role"
SET permissions = array_append(permissions, 'time.record'), updated_at = CURRENT_TIMESTAMP
WHERE builtin AND key IN ('super_user', 'administrator', 'fm_manager', 'planner', 'technician')
  AND NOT 'time.record' = ANY(permissions);

UPDATE "role"
SET permissions = array_append(permissions, 'costs.manage_rates'), updated_at = CURRENT_TIMESTAMP
WHERE builtin AND key IN ('super_user', 'administrator', 'finance')
  AND NOT 'costs.manage_rates' = ANY(permissions);
