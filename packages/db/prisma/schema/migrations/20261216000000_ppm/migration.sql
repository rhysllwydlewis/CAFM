
-- AlterTable
ALTER TABLE "work_order" ADD COLUMN     "ppm_schedule_asset_id" UUID,
ADD COLUMN     "scheduled_for" DATE;

-- CreateTable
CREATE TABLE "ppm_task_template" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discipline" TEXT,
    "criticality" TEXT NOT NULL DEFAULT 'optimal',
    "duration_minutes" INTEGER NOT NULL,
    "skills" TEXT,
    "safety_notes" TEXT,
    "steps" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ppm_task_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppm_schedule" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "template_id" UUID,
    "discipline" TEXT,
    "criticality" TEXT NOT NULL DEFAULT 'optimal',
    "freq_type" TEXT NOT NULL,
    "calendar_unit" TEXT,
    "interval" INTEGER,
    "meter_name" TEXT,
    "meter_interval" DECIMAL(18,6),
    "mode" TEXT NOT NULL DEFAULT 'fixed',
    "starts_on" DATE NOT NULL,
    "lead_days" INTEGER NOT NULL DEFAULT 28,
    "duration_minutes" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 3,
    "assignee_id" UUID,
    "estimated_cost_minor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ppm_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppm_schedule_asset" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "next_due_on" DATE,
    "next_due_total" DECIMAL(30,6),
    "last_done_on" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppm_schedule_asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ppm_task_template_tenant_id_id_key" ON "ppm_task_template"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ppm_task_template_tenant_id_name_key" ON "ppm_task_template"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "ppm_schedule_tenant_id_active_idx" ON "ppm_schedule"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ppm_schedule_tenant_id_id_key" ON "ppm_schedule"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ppm_schedule_tenant_id_number_key" ON "ppm_schedule"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "ppm_schedule_asset_tenant_id_next_due_on_idx" ON "ppm_schedule_asset"("tenant_id", "next_due_on");

-- CreateIndex
CREATE UNIQUE INDEX "ppm_schedule_asset_tenant_id_id_key" ON "ppm_schedule_asset"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ppm_schedule_asset_tenant_id_schedule_id_asset_id_key" ON "ppm_schedule_asset"("tenant_id", "schedule_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_tenant_id_ppm_schedule_asset_id_scheduled_for_key" ON "work_order"("tenant_id", "ppm_schedule_asset_id", "scheduled_for");

-- AddForeignKey
ALTER TABLE "ppm_task_template" ADD CONSTRAINT "ppm_task_template_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppm_schedule" ADD CONSTRAINT "ppm_schedule_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppm_schedule" ADD CONSTRAINT "ppm_schedule_tenant_id_template_id_fkey" FOREIGN KEY ("tenant_id", "template_id") REFERENCES "ppm_task_template"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppm_schedule" ADD CONSTRAINT "ppm_schedule_tenant_id_assignee_id_fkey" FOREIGN KEY ("tenant_id", "assignee_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppm_schedule_asset" ADD CONSTRAINT "ppm_schedule_asset_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppm_schedule_asset" ADD CONSTRAINT "ppm_schedule_asset_tenant_id_schedule_id_fkey" FOREIGN KEY ("tenant_id", "schedule_id") REFERENCES "ppm_schedule"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppm_schedule_asset" ADD CONSTRAINT "ppm_schedule_asset_tenant_id_asset_id_fkey" FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "asset"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenant_id_ppm_schedule_asset_id_fkey" FOREIGN KEY ("tenant_id", "ppm_schedule_asset_id") REFERENCES "ppm_schedule_asset"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS: separate read and write policies, as for every tenant-owned table.
ALTER TABLE "ppm_task_template" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ppm_task_template_read ON "ppm_task_template" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY ppm_task_template_insert ON "ppm_task_template" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY ppm_task_template_update ON "ppm_task_template" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY ppm_task_template_delete ON "ppm_task_template" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "ppm_schedule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ppm_schedule_read ON "ppm_schedule" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY ppm_schedule_insert ON "ppm_schedule" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY ppm_schedule_update ON "ppm_schedule" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY ppm_schedule_delete ON "ppm_schedule" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "ppm_schedule_asset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ppm_schedule_asset_read ON "ppm_schedule_asset" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY ppm_schedule_asset_insert ON "ppm_schedule_asset" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY ppm_schedule_asset_update ON "ppm_schedule_asset" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY ppm_schedule_asset_delete ON "ppm_schedule_asset" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- The database refuses what the API never produces.
ALTER TABLE ppm_task_template
  ADD CONSTRAINT ppm_task_template_criticality_valid CHECK (criticality IN ('statutory', 'mandatory', 'optimal', 'discretionary')),
  ADD CONSTRAINT ppm_task_template_duration_valid CHECK (duration_minutes BETWEEN 5 AND 10080),
  ADD CONSTRAINT ppm_task_template_steps_valid CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 50),
  ADD CONSTRAINT ppm_task_template_text_valid CHECK (length(btrim(name)) > 0 AND length(name) <= 120);

ALTER TABLE ppm_schedule
  ADD CONSTRAINT ppm_schedule_criticality_valid CHECK (criticality IN ('statutory', 'mandatory', 'optimal', 'discretionary')),
  ADD CONSTRAINT ppm_schedule_mode_valid CHECK (mode IN ('fixed', 'floating')),
  ADD CONSTRAINT ppm_schedule_frequency_valid CHECK (
    (freq_type = 'calendar' AND calendar_unit IN ('day', 'week', 'month', 'year') AND interval BETWEEN 1 AND 120
      AND meter_name IS NULL AND meter_interval IS NULL)
    OR
    (freq_type = 'meter' AND meter_name IS NOT NULL AND length(btrim(meter_name)) > 0 AND meter_interval > 0
      AND calendar_unit IS NULL AND interval IS NULL AND mode = 'floating')
  ),
  ADD CONSTRAINT ppm_schedule_lead_valid CHECK (lead_days BETWEEN 0 AND 365),
  ADD CONSTRAINT ppm_schedule_duration_valid CHECK (duration_minutes BETWEEN 5 AND 10080),
  ADD CONSTRAINT ppm_schedule_priority_valid CHECK (priority BETWEEN 1 AND 4),
  ADD CONSTRAINT ppm_schedule_cost_valid CHECK (estimated_cost_minor IS NULL OR estimated_cost_minor BETWEEN 0 AND 1000000000),
  ADD CONSTRAINT ppm_schedule_currency_valid CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT ppm_schedule_text_valid CHECK (length(btrim(title)) > 0 AND length(title) <= 150);

-- A job raised from a schedule has both its asset row and its due day, or neither.
ALTER TABLE work_order
  ADD CONSTRAINT work_order_ppm_valid CHECK ((ppm_schedule_asset_id IS NULL) = (scheduled_for IS NULL));
