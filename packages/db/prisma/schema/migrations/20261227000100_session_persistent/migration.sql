-- AlterTable
ALTER TABLE "session" ADD COLUMN     "persistent" BOOLEAN NOT NULL DEFAULT false;

-- Sessions issued before this column existed: a lifetime over 12 hours means "Keep me signed in" was chosen.
UPDATE "session" SET "persistent" = true WHERE "expires_at" - "created_at" > interval '12 hours';
