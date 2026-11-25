-- CreateTable
CREATE TABLE "import_batch" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "file_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "row_count" INTEGER NOT NULL,
    "created_ids" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolled_back_at" TIMESTAMPTZ(3),
    "rolled_back_by" UUID,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batch_tenant_id_entity_type_created_at_idx" ON "import_batch"("tenant_id", "entity_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "import_batch_tenant_id_id_key" ON "import_batch"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The application always sets a transaction-local tenant before reading or writing.
ALTER TABLE "import_batch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_batch_read" ON "import_batch" FOR SELECT USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY "import_batch_insert" ON "import_batch" FOR INSERT WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY "import_batch_update" ON "import_batch" FOR UPDATE USING (tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY "import_batch_delete" ON "import_batch" FOR DELETE USING (tenant_id::text = current_setting('app.tenant_id', true));
