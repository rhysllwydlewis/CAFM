-- CreateTable
CREATE TABLE "account_mfa" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "secret_cipher" TEXT NOT NULL,
    "enabled_at" TIMESTAMPTZ(3),
    "last_step" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_mfa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_code" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_challenge" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "persistent" BOOLEAN NOT NULL DEFAULT false,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_mfa_account_id_key" ON "account_mfa"("account_id");

-- CreateIndex
CREATE INDEX "mfa_recovery_code_account_id_idx" ON "mfa_recovery_code"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_challenge_token_hash_key" ON "mfa_challenge"("token_hash");

-- CreateIndex
CREATE INDEX "mfa_challenge_account_id_idx" ON "mfa_challenge"("account_id");

-- AddForeignKey
ALTER TABLE "account_mfa" ADD CONSTRAINT "account_mfa_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_code" ADD CONSTRAINT "mfa_recovery_code_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_challenge" ADD CONSTRAINT "mfa_challenge_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

