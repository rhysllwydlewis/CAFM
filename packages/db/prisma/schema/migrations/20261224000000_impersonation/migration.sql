-- AlterTable
ALTER TABLE "session" ADD COLUMN     "impersonator_account_id" UUID,
ADD COLUMN     "impersonator_membership_id" UUID;

-- Grant the new permission to existing Super User roles (new organisations get it when their roles are seeded).
UPDATE "role"
SET permissions = array_append(permissions, 'people.impersonate'), updated_at = CURRENT_TIMESTAMP
WHERE builtin AND key = 'super_user' AND NOT 'people.impersonate' = ANY(permissions);
