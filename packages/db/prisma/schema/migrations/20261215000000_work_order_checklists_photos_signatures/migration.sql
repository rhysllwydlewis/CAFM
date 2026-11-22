
-- AlterTable
ALTER TABLE "record_attachment" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "phase" TEXT,
ADD COLUMN     "work_order_id" UUID;

-- CreateTable
CREATE TABLE "checklist_template" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "gate" TEXT NOT NULL DEFAULT 'none',
    "items" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checklist_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_checklist" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "gate" TEXT NOT NULL DEFAULT 'none',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_checklist_item" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT,
    "answer" TEXT,
    "note" TEXT,
    "answered_by_id" UUID,
    "answered_by_name" TEXT,
    "answered_at" TIMESTAMPTZ(3),

    CONSTRAINT "work_order_checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_signature" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "signer_name" TEXT NOT NULL,
    "attachment_id" UUID NOT NULL,
    "recorded_by_id" UUID,
    "signed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_signature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checklist_template_tenant_id_id_key" ON "checklist_template"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_template_tenant_id_name_key" ON "checklist_template"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "work_order_checklist_tenant_id_work_order_id_created_at_id_idx" ON "work_order_checklist"("tenant_id", "work_order_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_checklist_tenant_id_id_key" ON "work_order_checklist"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "work_order_checklist_item_tenant_id_checklist_id_position_idx" ON "work_order_checklist_item"("tenant_id", "checklist_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_checklist_item_tenant_id_id_key" ON "work_order_checklist_item"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_signature_tenant_id_id_key" ON "work_order_signature"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_signature_tenant_id_work_order_id_role_key" ON "work_order_signature"("tenant_id", "work_order_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_signature_tenant_id_attachment_id_key" ON "work_order_signature"("tenant_id", "attachment_id");

-- CreateIndex
CREATE INDEX "record_attachment_tenant_id_work_order_id_created_at_idx" ON "record_attachment"("tenant_id", "work_order_id", "created_at");

-- AddForeignKey
ALTER TABLE "record_attachment" ADD CONSTRAINT "record_attachment_tenant_id_work_order_id_fkey" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_order"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template" ADD CONSTRAINT "checklist_template_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_checklist" ADD CONSTRAINT "work_order_checklist_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_checklist" ADD CONSTRAINT "work_order_checklist_tenant_id_work_order_id_fkey" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_order"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_checklist" ADD CONSTRAINT "work_order_checklist_tenant_id_created_by_id_fkey" FOREIGN KEY ("tenant_id", "created_by_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_checklist_item" ADD CONSTRAINT "work_order_checklist_item_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_checklist_item" ADD CONSTRAINT "work_order_checklist_item_tenant_id_checklist_id_fkey" FOREIGN KEY ("tenant_id", "checklist_id") REFERENCES "work_order_checklist"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_checklist_item" ADD CONSTRAINT "work_order_checklist_item_tenant_id_answered_by_id_fkey" FOREIGN KEY ("tenant_id", "answered_by_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_signature" ADD CONSTRAINT "work_order_signature_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_signature" ADD CONSTRAINT "work_order_signature_tenant_id_work_order_id_fkey" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_order"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_signature" ADD CONSTRAINT "work_order_signature_tenant_id_attachment_id_fkey" FOREIGN KEY ("tenant_id", "attachment_id") REFERENCES "record_attachment"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_signature" ADD CONSTRAINT "work_order_signature_tenant_id_recorded_by_id_fkey" FOREIGN KEY ("tenant_id", "recorded_by_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS: separate read and write policies, as for every tenant-owned table.
ALTER TABLE "checklist_template" ENABLE ROW LEVEL SECURITY;
CREATE POLICY checklist_template_read ON "checklist_template" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY checklist_template_insert ON "checklist_template" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY checklist_template_update ON "checklist_template" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY checklist_template_delete ON "checklist_template" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "work_order_checklist" ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_order_checklist_read ON "work_order_checklist" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_checklist_insert ON "work_order_checklist" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_checklist_update ON "work_order_checklist" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_checklist_delete ON "work_order_checklist" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "work_order_checklist_item" ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_order_checklist_item_read ON "work_order_checklist_item" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_checklist_item_insert ON "work_order_checklist_item" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_checklist_item_update ON "work_order_checklist_item" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_checklist_item_delete ON "work_order_checklist_item" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "work_order_signature" ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_order_signature_read ON "work_order_signature" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_signature_insert ON "work_order_signature" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_signature_update ON "work_order_signature" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_signature_delete ON "work_order_signature" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- The database refuses what the API never produces.
ALTER TABLE checklist_template
  ADD CONSTRAINT checklist_template_gate_valid CHECK (gate IN ('none', 'start', 'completion')),
  ADD CONSTRAINT checklist_template_items_valid CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 50),
  ADD CONSTRAINT checklist_template_text_valid CHECK (length(btrim(name)) > 0 AND length(name) <= 120);

ALTER TABLE work_order_checklist
  ADD CONSTRAINT work_order_checklist_gate_valid CHECK (gate IN ('none', 'start', 'completion')),
  ADD CONSTRAINT work_order_checklist_text_valid CHECK (length(btrim(title)) > 0 AND length(title) <= 120);

ALTER TABLE work_order_checklist_item
  ADD CONSTRAINT work_order_checklist_item_kind_valid CHECK (kind IN ('tick', 'pass_fail', 'number', 'text')),
  ADD CONSTRAINT work_order_checklist_item_text_valid CHECK (length(btrim(label)) > 0 AND length(label) <= 200 AND (unit IS NULL OR (kind = 'number' AND length(unit) <= 20))),
  ADD CONSTRAINT work_order_checklist_item_answer_valid CHECK (
    (answer IS NULL) = (answered_at IS NULL)
    AND (answer IS NULL OR length(answer) <= 500)
    AND (answer IS NULL OR kind <> 'tick' OR answer = 'done')
    AND (answer IS NULL OR kind <> 'pass_fail' OR answer IN ('pass', 'fail', 'na'))
    AND (answer IS NULL OR kind <> 'number' OR answer ~ '^-?[0-9]{1,9}(\.[0-9]{1,3})?$')
    AND (answer IS NULL OR kind <> 'pass_fail' OR answer <> 'fail' OR note IS NOT NULL)
  ),
  ADD CONSTRAINT work_order_checklist_item_note_valid CHECK (note IS NULL OR length(note) <= 500);

ALTER TABLE work_order_signature
  ADD CONSTRAINT work_order_signature_role_valid CHECK (role IN ('customer', 'technician')),
  ADD CONSTRAINT work_order_signature_name_valid CHECK (length(btrim(signer_name)) > 0 AND length(signer_name) <= 120);

-- A file belongs to exactly one record (an asset, a request or a job), and a job's photo is before, after or other.
ALTER TABLE record_attachment DROP CONSTRAINT record_attachment_parent_check;
ALTER TABLE record_attachment
  ADD CONSTRAINT record_attachment_parent_check CHECK (num_nonnulls(asset_id, request_id, work_order_id) = 1),
  ADD CONSTRAINT record_attachment_phase_valid CHECK (phase IS NULL OR (work_order_id IS NOT NULL AND phase IN ('before', 'after', 'other'))),
  ADD CONSTRAINT record_attachment_caption_valid CHECK (caption IS NULL OR (work_order_id IS NOT NULL AND length(caption) <= 150));
