-- When a phone's refresh token last changed, so a replay of the previous token within a short window can be told
-- from theft (a refresh whose response never arrived). mobile_device is account-owned, not tenant-owned.
ALTER TABLE "mobile_device" ADD COLUMN "refresh_rotated_at" TIMESTAMPTZ(3);
