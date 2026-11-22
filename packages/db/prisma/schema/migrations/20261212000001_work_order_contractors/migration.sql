-- AlterTable
ALTER TABLE "work_order_entry" ADD COLUMN     "actor_name" TEXT;

-- CreateTable
CREATE TABLE "work_order_contractor" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_contractor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_order_contractor_token_hash_key" ON "work_order_contractor"("token_hash");

-- CreateIndex
CREATE INDEX "work_order_contractor_tenant_id_work_order_id_created_at_idx" ON "work_order_contractor"("tenant_id", "work_order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_contractor_tenant_id_id_key" ON "work_order_contractor"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "work_order_contractor" ADD CONSTRAINT "work_order_contractor_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_contractor" ADD CONSTRAINT "work_order_contractor_tenant_id_work_order_id_fkey" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_order"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_contractor" ADD CONSTRAINT "work_order_contractor_tenant_id_created_by_id_fkey" FOREIGN KEY ("tenant_id", "created_by_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS: separate read and write policies, as for every tenant-owned table.
ALTER TABLE "work_order_contractor" ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_order_contractor_read ON "work_order_contractor" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_contractor_insert ON "work_order_contractor" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_contractor_update ON "work_order_contractor" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY work_order_contractor_delete ON "work_order_contractor" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE work_order_contractor
  ADD CONSTRAINT work_order_contractor_name_valid CHECK (length(btrim(name)) > 0 AND length(name) <= 120),
  ADD CONSTRAINT work_order_contractor_email_valid CHECK (position('@' IN email) > 1 AND length(email) <= 254),
  ADD CONSTRAINT work_order_contractor_expiry_valid CHECK (expires_at > created_at);

ALTER TABLE work_order_entry
  ADD CONSTRAINT work_order_entry_actor_valid CHECK (author_id IS NULL OR actor_name IS NULL);

-- The tenant and id for one exact token hash, so the public contractor link can continue inside
-- withTenant. Nothing can be listed or searched through it.
CREATE FUNCTION find_work_order_contractor(hash text)
RETURNS TABLE (id uuid, tenant_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, tenant_id FROM "work_order_contractor" WHERE token_hash = hash;
$$;
REVOKE ALL ON FUNCTION find_work_order_contractor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_work_order_contractor(text) TO cafm_app;
