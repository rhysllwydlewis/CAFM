import { Module } from '@nestjs/common';
import { AssetOperationsController } from '../assets/asset-operations.controller';
import { WorkOrderChecklistsController } from '../work-orders/work-order-checklists.controller';
import { WorkOrdersController } from '../work-orders/work-orders.controller';
import { MobileController } from './mobile.controller';
import { MobileMutations } from './mobile-mutations';

/** The controllers are provided here too, so a change from a phone runs the same code as the website's. */
@Module({
  controllers: [MobileController],
  providers: [MobileMutations, WorkOrdersController, WorkOrderChecklistsController, AssetOperationsController],
})
export class MobileModule {}
