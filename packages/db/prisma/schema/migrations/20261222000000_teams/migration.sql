
-- CreateTable
CREATE TABLE "team" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_member" (
    "tenant_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_member_pkey" PRIMARY KEY ("tenant_id","team_id","membership_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_tenant_id_id_key" ON "team"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "team_tenant_id_name_key" ON "team"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "team_member_tenant_id_membership_id_idx" ON "team_member"("tenant_id", "membership_id");

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_tenant_id_team_id_fkey" FOREIGN KEY ("tenant_id", "team_id") REFERENCES "team"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "membership"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The application always sets a transaction-local tenant before reading or writing.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['team', 'team_member'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_delete', t);
  END LOOP;
END
$$;
