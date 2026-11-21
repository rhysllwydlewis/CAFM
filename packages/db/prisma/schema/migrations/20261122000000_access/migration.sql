-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "scope" TEXT NOT NULL DEFAULT 'all',
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "actor_account_id" UUID,
    "actor_membership_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "changes" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_entitlement" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "limit" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'override',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_tenant_id_key_key" ON "role"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "audit_event_tenant_id_created_at_idx" ON "audit_event"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_processed_at_available_at_idx" ON "outbox"("processed_at", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_entitlement_tenant_id_feature_key" ON "tenant_entitlement"("tenant_id", "feature");

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_entitlement" ADD CONSTRAINT "tenant_entitlement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security -------------------------------------------------------
-- Same pattern as membership: reads and writes only inside the tenant set by
-- withTenant (app.tenant_id). Nothing is visible with no tenant set.

-- role: full read and write inside the tenant.
ALTER TABLE "role" ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_read ON "role" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY role_insert ON "role" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY role_update ON "role" FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY role_delete ON "role" FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- audit_event: append-only for the app. No update or delete policy, and the
-- privileges are revoked too, so audit history can't be rewritten.
ALTER TABLE "audit_event" ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_event_read ON "audit_event" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY audit_event_insert ON "audit_event" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
REVOKE UPDATE, DELETE ON "audit_event" FROM cafm_app;

-- outbox: the app writes messages inside its tenant. The worker claims and
-- completes them across tenants only through the two functions below, which
-- run as the owner, so no role needs to bypass RLS.
ALTER TABLE "outbox" ENABLE ROW LEVEL SECURITY;
CREATE POLICY outbox_read ON "outbox" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY outbox_insert ON "outbox" FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
REVOKE UPDATE, DELETE ON "outbox" FROM cafm_app;

CREATE FUNCTION claim_outbox(batch_size integer)
RETURNS SETOF "outbox"
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE "outbox" SET attempts = attempts + 1,
         available_at = now() + make_interval(secs => 30 * power(2, LEAST(attempts, 8)))
  WHERE id IN (
    SELECT id FROM "outbox"
    WHERE processed_at IS NULL AND available_at <= now() AND attempts < 10
    ORDER BY available_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

CREATE FUNCTION complete_outbox(message_id uuid, error text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE "outbox"
  SET processed_at = CASE WHEN error IS NULL THEN now() ELSE NULL END,
      last_error = error
  WHERE id = message_id;
$$;

REVOKE ALL ON FUNCTION claim_outbox(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_outbox(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_outbox(integer) TO cafm_app;
GRANT EXECUTE ON FUNCTION complete_outbox(uuid, text) TO cafm_app;

-- tenant_entitlement: the app can read its own tenant's overrides; only the
-- platform (owner role: seed, CLI, billing webhooks) writes them.
ALTER TABLE "tenant_entitlement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_entitlement_read ON "tenant_entitlement" FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));
REVOKE INSERT, UPDATE, DELETE ON "tenant_entitlement" FROM cafm_app;
