-- CreateTable
CREATE TABLE "work_order" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'reactive',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'logged',
    "pause_reason" TEXT,
    "location_id" UUID NOT NULL,
    "asset_id" UUID,
    "request_id" UUID,
    "assignee_id" UUID,
    "created_by_id" UUID,
    "impact" INTEGER NOT NULL,
    "urgency" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "response_due_at" TIMESTAMPTZ(3),
    "attend_due_at" TIMESTAMPTZ(3),
    "fix_due_at" TIMESTAMPTZ(3),
    "first_response_at" TIMESTAMPTZ(3),
    "attended_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "custom" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_entry" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "author_id" UUID,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_tenant_id_status_fix_due_at_idx" ON "work_order"("tenant_id", "status", "fix_due_at");

-- CreateIndex
CREATE INDEX "work_order_tenant_id_assignee_id_status_idx" ON "work_order"("tenant_id", "assignee_id", "status");

-- CreateIndex
CREATE INDEX "work_order_tenant_id_request_id_idx" ON "work_order"("tenant_id", "request_id");

-- CreateIndex
CREATE INDEX "work_order_tenant_id_asset_id_idx" ON "work_order"("tenant_id", "asset_id");

-- CreateIndex
CREATE INDEX "work_order_tenant_id_location_id_created_at_idx" ON "work_order"("tenant_id", "location_id", "created_at");

-- CreateIndex
CREATE INDEX "work_order_tenant_id_created_at_id_idx" ON "work_order"("tenant_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_tenant_id_id_key" ON "work_order"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_tenant_id_number_key" ON "work_order"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "work_order_entry_tenant_id_work_order_id_created_at_id_idx" ON "work_order_entry"("tenant_id", "work_order_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_entry_tenant_id_id_key" ON "work_order_entry"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "location"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenant_id_asset_id_fkey" FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "asset"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_request"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenant_id_assignee_id_fkey" FOREIGN KEY ("tenant_id", "assignee_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenant_id_created_by_id_fkey" FOREIGN KEY ("tenant_id", "created_by_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_entry" ADD CONSTRAINT "work_order_entry_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_entry" ADD CONSTRAINT "work_order_entry_tenant_id_work_order_id_fkey" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_order"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_entry" ADD CONSTRAINT "work_order_entry_tenant_id_author_id_fkey" FOREIGN KEY ("tenant_id", "author_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS: a second check on every tenant-owned table, separate read and write policies.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work_order', 'work_order_entry']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_delete', t);
  END LOOP;
END $$;

ALTER TABLE work_order
  ADD CONSTRAINT work_order_type_valid CHECK (type IN ('reactive', 'ppm', 'project', 'inspection')),
  ADD CONSTRAINT work_order_status_valid CHECK (status IN ('logged', 'assigned', 'accepted', 'travelling', 'on_site', 'paused', 'completed', 'verified', 'closed', 'cancelled')),
  ADD CONSTRAINT work_order_pause_valid CHECK ((status = 'paused') = (pause_reason IS NOT NULL)),
  ADD CONSTRAINT work_order_pause_reason_valid CHECK (pause_reason IS NULL OR pause_reason IN ('awaiting_parts', 'awaiting_access', 'awaiting_approval', 'awaiting_contractor', 'other')),
  ADD CONSTRAINT work_order_levels_valid CHECK (impact BETWEEN 1 AND 3 AND urgency BETWEEN 1 AND 3 AND priority BETWEEN 1 AND 4),
  ADD CONSTRAINT work_order_version_valid CHECK (version > 0),
  ADD CONSTRAINT work_order_text_valid CHECK (length(btrim(title)) > 0 AND length(title) <= 160 AND length(description) <= 6000);

ALTER TABLE work_order_entry
  ADD CONSTRAINT work_order_entry_kind_valid CHECK (kind IN ('status', 'assignment', 'comment', 'system')),
  ADD CONSTRAINT work_order_entry_body_valid CHECK (length(btrim(body)) > 0 AND length(body) <= 6000);
