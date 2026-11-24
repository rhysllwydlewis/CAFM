-- AlterTable
ALTER TABLE "session" ADD COLUMN     "impersonator_account_id" UUID,
ADD COLUMN     "impersonator_membership_id" UUID;
