
-- CreateTable
CREATE TABLE "tenant_branding" (
    "tenant_id" UUID NOT NULL,
    "accent_colour" TEXT,
    "login_message" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_branding_pkey" PRIMARY KEY ("tenant_id")
);

-- AddForeignKey
ALTER TABLE "tenant_branding" ADD CONSTRAINT "tenant_branding_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The application always sets a transaction-local tenant before reading or writing.
ALTER TABLE "tenant_branding" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_branding_read" ON "tenant_branding" FOR SELECT USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY "tenant_branding_insert" ON "tenant_branding" FOR INSERT WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY "tenant_branding_update" ON "tenant_branding" FOR UPDATE USING (tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY "tenant_branding_delete" ON "tenant_branding" FOR DELETE USING (tenant_id::text = current_setting('app.tenant_id', true));
