-- AlterTable
ALTER TABLE "work_order" ADD COLUMN     "sla_paused_at" TIMESTAMPTZ(3),
ADD COLUMN     "sla_paused_minutes" INTEGER NOT NULL DEFAULT 0;


ALTER TABLE work_order
  ADD CONSTRAINT work_order_sla_pause_valid CHECK (sla_paused_at IS NULL OR status = 'paused'),
  ADD CONSTRAINT work_order_sla_minutes_valid CHECK (sla_paused_minutes >= 0);
