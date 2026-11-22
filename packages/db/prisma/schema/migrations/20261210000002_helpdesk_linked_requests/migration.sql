CREATE INDEX "service_request_tenant_id_merged_into_id_idx"
  ON "service_request" ("tenant_id", "merged_into_id");

-- Earlier drafts could merge a primary request into another primary request.
-- Point every existing duplicate directly at the final primary.
WITH RECURSIVE links AS (
  SELECT tenant_id, id, merged_into_id
  FROM service_request
  WHERE merged_into_id IS NOT NULL
  UNION ALL
  SELECT link.tenant_id, link.id, target.merged_into_id
  FROM links AS link
  JOIN service_request AS target ON target.tenant_id = link.tenant_id AND target.id = link.merged_into_id
  WHERE target.merged_into_id IS NOT NULL
)
UPDATE service_request AS original
SET merged_into_id = link.merged_into_id
FROM links AS link
JOIN service_request AS target ON target.tenant_id = link.tenant_id AND target.id = link.merged_into_id
WHERE original.tenant_id = link.tenant_id AND original.id = link.id
  AND target.merged_into_id IS NULL AND original.merged_into_id <> link.merged_into_id;

DROP INDEX "received_request_message_tenant_id_mailbox_id_message_id_key";
CREATE UNIQUE INDEX "received_request_message_delivery_key"
  ON "received_request_message" ("tenant_id", "mailbox_id", "message_id", "sender");
