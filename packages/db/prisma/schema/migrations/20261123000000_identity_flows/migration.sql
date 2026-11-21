-- AlterTable
ALTER TABLE "account" ADD COLUMN     "terms_accepted_at" TIMESTAMPTZ(3),
ADD COLUMN     "terms_version" TEXT;

-- AlterTable
ALTER TABLE "outbox" ALTER COLUMN "tenant_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "demo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "password_reset" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "licence" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "invited_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "captured_email" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "captured_email_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_hash_key" ON "password_reset"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_account_id_idx" ON "password_reset"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "invite_token_hash_key" ON "invite"("token_hash");

-- CreateIndex
CREATE INDEX "invite_tenant_id_email_idx" ON "invite"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "captured_email_to_created_at_idx" ON "captured_email"("to", "created_at");

-- AddForeignKey
ALTER TABLE "password_reset" ADD CONSTRAINT "password_reset_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security -------------------------------------------------------

-- invite: tenant-owned, same read/write pattern as the other tenant tables.
ALTER TABLE "invite" ENABLE ROW LEVEL SECURITY;
CREATE POLICY invite_read ON "invite" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY invite_insert ON "invite" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY invite_update ON "invite" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY invite_delete ON "invite" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Someone opening an invite link has no tenant yet. This returns only the
-- tenant and id for one exact token hash, so the API can continue inside
-- withTenant; nothing can be listed or searched through it.
CREATE FUNCTION find_invite(hash text)
RETURNS TABLE (id uuid, tenant_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, tenant_id FROM "invite" WHERE token_hash = hash;
$$;
REVOKE ALL ON FUNCTION find_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_invite(text) TO cafm_app;

-- Platform messages (no tenant), e.g. password reset email. The outbox
-- insert policy only allows the current tenant, so these go through here.
CREATE FUNCTION enqueue_platform(message_topic text, message_payload jsonb)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO "outbox" (id, tenant_id, topic, payload)
  VALUES (gen_random_uuid(), NULL, message_topic, message_payload)
  RETURNING id;
$$;
REVOKE ALL ON FUNCTION enqueue_platform(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_platform(text, jsonb) TO cafm_app;

-- password_reset and captured_email are platform tables (no tenant), like
-- account and session: reachable by the app role through the default grants.
