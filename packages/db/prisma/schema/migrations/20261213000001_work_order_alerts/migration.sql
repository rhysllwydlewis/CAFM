-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "work_order_id" UUID;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_tenant_id_work_order_id_fkey" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_order"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A notification points at one thing at most: a request, an asset or a work order.
ALTER TABLE notification DROP CONSTRAINT notification_one_target;
ALTER TABLE notification ADD CONSTRAINT notification_one_target CHECK (num_nonnulls(asset_id, request_id, work_order_id) <= 1);
