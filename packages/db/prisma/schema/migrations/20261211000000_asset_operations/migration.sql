-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "asset_id" UUID;

-- CreateTable
CREATE TABLE "asset_tag" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_meter" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "rollover_at" DECIMAL(18,6),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_meter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_meter_reading" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "meter_id" UUID NOT NULL,
    "submission" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "total" DECIMAL(30,6) NOT NULL,
    "rolled_over" BOOLEAN NOT NULL,

    CONSTRAINT "asset_meter_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_warranty" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "expires_on" DATE NOT NULL,
    "notice_days" INTEGER NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "asset_warranty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_attachment" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID,
    "request_id" UUID,
    "filename" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "byte_length" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_content" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "attachment_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_tag_tenant_id_asset_id_idx" ON "asset_tag"("tenant_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_tag_tenant_id_code_key" ON "asset_tag"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "asset_meter_tenant_id_id_key" ON "asset_meter"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_meter_tenant_id_asset_id_name_key" ON "asset_meter"("tenant_id", "asset_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "asset_meter_reading_tenant_id_meter_id_submission_key" ON "asset_meter_reading"("tenant_id", "meter_id", "submission");

-- CreateIndex
CREATE UNIQUE INDEX "asset_meter_reading_tenant_id_meter_id_recorded_at_key" ON "asset_meter_reading"("tenant_id", "meter_id", "recorded_at");

-- CreateIndex
CREATE INDEX "asset_warranty_tenant_id_asset_id_idx" ON "asset_warranty"("tenant_id", "asset_id");

-- CreateIndex
CREATE INDEX "asset_warranty_tenant_id_expires_on_idx" ON "asset_warranty"("tenant_id", "expires_on");

-- CreateIndex
CREATE UNIQUE INDEX "asset_warranty_tenant_id_id_key" ON "asset_warranty"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "record_attachment_tenant_id_asset_id_created_at_idx" ON "record_attachment"("tenant_id", "asset_id", "created_at");

-- CreateIndex
CREATE INDEX "record_attachment_tenant_id_request_id_created_at_idx" ON "record_attachment"("tenant_id", "request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "record_attachment_tenant_id_id_key" ON "record_attachment"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_content_tenant_id_id_key" ON "attachment_content"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "asset_tag" ADD CONSTRAINT "asset_tag_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_tag" ADD CONSTRAINT "asset_tag_tenant_id_asset_id_fkey" FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "asset"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_meter" ADD CONSTRAINT "asset_meter_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_meter" ADD CONSTRAINT "asset_meter_tenant_id_asset_id_fkey" FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "asset"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_meter_reading" ADD CONSTRAINT "asset_meter_reading_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_meter_reading" ADD CONSTRAINT "asset_meter_reading_tenant_id_meter_id_fkey" FOREIGN KEY ("tenant_id", "meter_id") REFERENCES "asset_meter"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_warranty" ADD CONSTRAINT "asset_warranty_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_warranty" ADD CONSTRAINT "asset_warranty_tenant_id_asset_id_fkey" FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "asset"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_attachment" ADD CONSTRAINT "record_attachment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_attachment" ADD CONSTRAINT "record_attachment_tenant_id_asset_id_fkey" FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "asset"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_attachment" ADD CONSTRAINT "record_attachment_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_request"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_content" ADD CONSTRAINT "attachment_content_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_content" ADD CONSTRAINT "attachment_content_tenant_id_id_fkey" FOREIGN KEY ("tenant_id", "id") REFERENCES "record_attachment"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_tenant_id_asset_id_fkey" FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "asset"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "asset_tag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_tag_read ON "asset_tag" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_tag_insert ON "asset_tag" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_tag_update ON "asset_tag" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_tag_delete ON "asset_tag" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "asset_meter" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_meter_read ON "asset_meter" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_meter_insert ON "asset_meter" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_meter_update ON "asset_meter" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_meter_delete ON "asset_meter" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "asset_meter_reading" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_meter_reading_read ON "asset_meter_reading" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_meter_reading_insert ON "asset_meter_reading" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_meter_reading_update ON "asset_meter_reading" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_meter_reading_delete ON "asset_meter_reading" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "asset_warranty" ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_warranty_read ON "asset_warranty" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_warranty_insert ON "asset_warranty" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_warranty_update ON "asset_warranty" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY asset_warranty_delete ON "asset_warranty" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "record_attachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY record_attachment_read ON "record_attachment" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY record_attachment_insert ON "record_attachment" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY record_attachment_update ON "record_attachment" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY record_attachment_delete ON "record_attachment" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE "attachment_content" ENABLE ROW LEVEL SECURITY;
CREATE POLICY attachment_content_read ON "attachment_content" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY attachment_content_insert ON "attachment_content" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY attachment_content_update ON "attachment_content" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY attachment_content_delete ON "attachment_content" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE asset_tag ADD CONSTRAINT asset_tag_kind_check CHECK (kind IN ('qr', 'barcode', 'nfc'));
ALTER TABLE asset_meter ADD CONSTRAINT asset_meter_rollover_check CHECK (rollover_at > 0);
ALTER TABLE asset_meter_reading ADD CONSTRAINT asset_meter_reading_value_check CHECK (value >= 0 AND total >= value);
ALTER TABLE asset_warranty ADD CONSTRAINT asset_warranty_date_check CHECK (expires_on >= starts_on AND notice_days BETWEEN 0 AND 365);
ALTER TABLE record_attachment ADD CONSTRAINT record_attachment_parent_check CHECK (num_nonnulls(asset_id, request_id) = 1);
ALTER TABLE record_attachment ADD CONSTRAINT record_attachment_size_check CHECK (byte_length BETWEEN 1 AND 8388608);
ALTER TABLE notification ADD CONSTRAINT notification_one_target CHECK (num_nonnulls(asset_id, request_id) <= 1);
