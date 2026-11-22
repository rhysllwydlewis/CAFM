-- CreateTable
CREATE TABLE "request_type" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "problem_code" TEXT NOT NULL,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "default_impact" INTEGER NOT NULL DEFAULT 2,
    "default_urgency" INTEGER NOT NULL DEFAULT 2,
    "acknowledgement" TEXT,
    "assignee_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "request_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_priority" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "impact" INTEGER NOT NULL,
    "urgency" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "response_minutes" INTEGER NOT NULL,
    "attend_minutes" INTEGER NOT NULL,
    "fix_minutes" INTEGER NOT NULL,
    "business_hours" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "request_priority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_request" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location_id" UUID NOT NULL,
    "asset_id" UUID,
    "type_id" UUID NOT NULL,
    "requester_id" UUID,
    "external_email" TEXT,
    "assignee_id" UUID,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "impact" INTEGER NOT NULL,
    "urgency" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "response_due_at" TIMESTAMPTZ(3),
    "attend_due_at" TIMESTAMPTZ(3),
    "fix_due_at" TIMESTAMPTZ(3),
    "first_response_at" TIMESTAMPTZ(3),
    "merged_into_id" UUID,
    "rating" INTEGER,
    "feedback" TEXT,
    "custom" JSONB NOT NULL DEFAULT '{}',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "submission_key" TEXT NOT NULL,
    "submission_hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_entry" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "author_id" UUID,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_mailbox" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "location_id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "request_mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "received_request_message" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "mailbox_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "message_id" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "received_request_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "recipient_id" UUID,
    "request_id" UUID,
    "recipient_email" TEXT,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "event_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "email_sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_template" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscription" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_push_delivery" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_push_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "request_type_tenant_id_id_key" ON "request_type"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "request_type_tenant_id_category_problem_code_name_key" ON "request_type"("tenant_id", "category", "problem_code", "name");

-- CreateIndex
CREATE UNIQUE INDEX "request_priority_tenant_id_impact_urgency_key" ON "request_priority"("tenant_id", "impact", "urgency");

-- CreateIndex
CREATE INDEX "service_request_tenant_id_status_response_due_at_idx" ON "service_request"("tenant_id", "status", "response_due_at");

-- CreateIndex
CREATE INDEX "service_request_tenant_id_requester_id_created_at_id_idx" ON "service_request"("tenant_id", "requester_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "service_request_tenant_id_assignee_id_status_idx" ON "service_request"("tenant_id", "assignee_id", "status");

-- CreateIndex
CREATE INDEX "service_request_tenant_id_location_id_type_id_created_at_idx" ON "service_request"("tenant_id", "location_id", "type_id", "created_at");

-- CreateIndex
CREATE INDEX "service_request_tenant_id_created_at_id_idx" ON "service_request"("tenant_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_request_tenant_id_id_key" ON "service_request"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_request_tenant_id_number_key" ON "service_request"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "service_request_tenant_id_submission_key_key" ON "service_request"("tenant_id", "submission_key");

-- CreateIndex
CREATE INDEX "request_entry_tenant_id_request_id_created_at_id_idx" ON "request_entry"("tenant_id", "request_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "request_entry_tenant_id_id_key" ON "request_entry"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "request_mailbox_tenant_id_id_key" ON "request_mailbox"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "request_mailbox_tenant_id_address_key" ON "request_mailbox"("tenant_id", "address");

-- CreateIndex
CREATE INDEX "received_request_message_tenant_id_request_id_idx" ON "received_request_message"("tenant_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "received_request_message_tenant_id_mailbox_id_message_id_key" ON "received_request_message"("tenant_id", "mailbox_id", "message_id");

-- CreateIndex
CREATE INDEX "notification_tenant_id_recipient_id_created_at_id_idx" ON "notification"("tenant_id", "recipient_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_tenant_id_id_key" ON "notification"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_tenant_id_event_key_key" ON "notification"("tenant_id", "event_key");

-- CreateIndex
CREATE UNIQUE INDEX "notification_template_tenant_id_key_key" ON "notification_template"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_tenant_id_id_key" ON "push_subscription"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_tenant_id_membership_id_endpoint_key" ON "push_subscription"("tenant_id", "membership_id", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "notification_push_delivery_tenant_id_notification_id_subscr_key" ON "notification_push_delivery"("tenant_id", "notification_id", "subscription_id");

-- AddForeignKey
ALTER TABLE "request_type" ADD CONSTRAINT "request_type_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_type" ADD CONSTRAINT "request_type_tenant_id_assignee_id_fkey" FOREIGN KEY ("tenant_id", "assignee_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_priority" ADD CONSTRAINT "request_priority_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request" ADD CONSTRAINT "service_request_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request" ADD CONSTRAINT "service_request_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "location"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request" ADD CONSTRAINT "service_request_tenant_id_asset_id_fkey" FOREIGN KEY ("tenant_id", "asset_id") REFERENCES "asset"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request" ADD CONSTRAINT "service_request_tenant_id_type_id_fkey" FOREIGN KEY ("tenant_id", "type_id") REFERENCES "request_type"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request" ADD CONSTRAINT "service_request_tenant_id_requester_id_fkey" FOREIGN KEY ("tenant_id", "requester_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request" ADD CONSTRAINT "service_request_tenant_id_assignee_id_fkey" FOREIGN KEY ("tenant_id", "assignee_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request" ADD CONSTRAINT "service_request_tenant_id_merged_into_id_fkey" FOREIGN KEY ("tenant_id", "merged_into_id") REFERENCES "service_request"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_entry" ADD CONSTRAINT "request_entry_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_entry" ADD CONSTRAINT "request_entry_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_request"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_entry" ADD CONSTRAINT "request_entry_tenant_id_author_id_fkey" FOREIGN KEY ("tenant_id", "author_id") REFERENCES "membership"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_mailbox" ADD CONSTRAINT "request_mailbox_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_mailbox" ADD CONSTRAINT "request_mailbox_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "location"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_mailbox" ADD CONSTRAINT "request_mailbox_tenant_id_type_id_fkey" FOREIGN KEY ("tenant_id", "type_id") REFERENCES "request_type"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "received_request_message" ADD CONSTRAINT "received_request_message_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "received_request_message" ADD CONSTRAINT "received_request_message_tenant_id_mailbox_id_fkey" FOREIGN KEY ("tenant_id", "mailbox_id") REFERENCES "request_mailbox"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "received_request_message" ADD CONSTRAINT "received_request_message_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_request"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_tenant_id_recipient_id_fkey" FOREIGN KEY ("tenant_id", "recipient_id") REFERENCES "membership"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_request"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_template" ADD CONSTRAINT "notification_template_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "membership"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_push_delivery" ADD CONSTRAINT "notification_push_delivery_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_push_delivery" ADD CONSTRAINT "notification_push_delivery_tenant_id_notification_id_fkey" FOREIGN KEY ("tenant_id", "notification_id") REFERENCES "notification"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_push_delivery" ADD CONSTRAINT "notification_push_delivery_tenant_id_subscription_id_fkey" FOREIGN KEY ("tenant_id", "subscription_id") REFERENCES "push_subscription"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Each request relationship is constrained by tenant as well as record ID.
-- RLS supplies a second check for every tenant-owned table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'request_type', 'request_priority', 'service_request', 'request_entry',
    'request_mailbox', 'received_request_message', 'notification',
    'notification_template', 'push_subscription', 'notification_push_delivery'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (tenant_id::text = current_setting(''app.tenant_id'', true))', t || '_delete', t);
  END LOOP;
END $$;

ALTER TABLE "service_request"
  ADD CONSTRAINT service_request_status_valid CHECK (status IN ('new','assigned','in_progress','completed','closed','rejected','merged')),
  ADD CONSTRAINT service_request_channel_valid CHECK (channel IN ('portal','qr','phone','email')),
  ADD CONSTRAINT service_request_rating_valid CHECK (rating BETWEEN 1 AND 5),
  ADD CONSTRAINT service_request_priority_valid CHECK (priority BETWEEN 1 AND 4),
  ADD CONSTRAINT service_request_version_valid CHECK (version > 0),
  ADD CONSTRAINT service_request_merge_valid CHECK ((status = 'merged') = (merged_into_id IS NOT NULL) AND id IS DISTINCT FROM merged_into_id);

ALTER TABLE "request_priority"
  ADD CONSTRAINT request_priority_levels_valid CHECK (impact BETWEEN 1 AND 3 AND urgency BETWEEN 1 AND 3 AND priority BETWEEN 1 AND 4),
  ADD CONSTRAINT request_priority_targets_valid CHECK (response_minutes > 0 AND response_minutes <= attend_minutes AND attend_minutes <= fix_minutes AND fix_minutes <= 43200);
