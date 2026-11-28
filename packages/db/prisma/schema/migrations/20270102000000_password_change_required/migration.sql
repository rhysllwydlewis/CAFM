-- An account whose password an administrator generated or reset is held on a change-password step until the
-- person sets their own (issue #120). The account table is global, so no row-level security applies.
ALTER TABLE "account" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
