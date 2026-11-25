-- A person's own display choices (such as a collapsed side menu), kept on the global account so they follow the
-- person across devices and organisations. Not tenant-owned, so no row-level security policy is needed.
ALTER TABLE "account" ADD COLUMN "preferences" JSONB NOT NULL DEFAULT '{}';
