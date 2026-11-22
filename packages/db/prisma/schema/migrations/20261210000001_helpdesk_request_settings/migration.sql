ALTER TABLE "request_type"
  ADD COLUMN "duplicate_window_hours" INTEGER NOT NULL DEFAULT 48,
  ADD CONSTRAINT request_type_duplicate_window_valid CHECK (duplicate_window_hours BETWEEN 1 AND 720);

ALTER TABLE "service_request" ADD COLUMN "rated_at" TIMESTAMPTZ(3);
