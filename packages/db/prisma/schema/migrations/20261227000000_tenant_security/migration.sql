-- CreateTable
CREATE TABLE "tenant_security" (
    "tenant_id" UUID NOT NULL,
    "password_min_length" INTEGER NOT NULL DEFAULT 12,
    "session_timeout_hours" INTEGER,
    "mfa_required" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_security_pkey" PRIMARY KEY ("tenant_id")
);

-- AddForeignKey
ALTER TABLE "tenant_security" ADD CONSTRAINT "tenant_security_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- The application always sets a transaction-local tenant before reading or writing.
ALTER TABLE "tenant_security" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_security_read" ON "tenant_security" FOR SELECT USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY "tenant_security_insert" ON "tenant_security" FOR INSERT WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY "tenant_security_update" ON "tenant_security" FOR UPDATE USING (tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY "tenant_security_delete" ON "tenant_security" FOR DELETE USING (tenant_id::text = current_setting('app.tenant_id', true));
