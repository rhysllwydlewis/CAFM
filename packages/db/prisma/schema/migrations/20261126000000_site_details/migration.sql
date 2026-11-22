-- AlterTable
ALTER TABLE "location" ADD COLUMN     "details" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "restricted_access" TEXT,
ADD COLUMN     "site_calendar" JSONB;
