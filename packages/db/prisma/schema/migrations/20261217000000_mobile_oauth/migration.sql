-- AlterTable
ALTER TABLE "session" ADD COLUMN     "device_id" UUID;

-- CreateTable
CREATE TABLE "mobile_device" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "previous_hash" TEXT,
    "refresh_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_ip" TEXT,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_code" (
    "id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "device_name" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mobile_device_refresh_hash_key" ON "mobile_device"("refresh_hash");

-- CreateIndex
CREATE INDEX "mobile_device_account_id_idx" ON "mobile_device"("account_id");

-- CreateIndex
CREATE INDEX "mobile_device_previous_hash_idx" ON "mobile_device"("previous_hash");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_code_code_hash_key" ON "oauth_code"("code_hash");

-- CreateIndex
CREATE INDEX "session_device_id_idx" ON "session"("device_id");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "mobile_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_device" ADD CONSTRAINT "mobile_device_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_device" ADD CONSTRAINT "mobile_device_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_code" ADD CONSTRAINT "oauth_code_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_code" ADD CONSTRAINT "oauth_code_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

