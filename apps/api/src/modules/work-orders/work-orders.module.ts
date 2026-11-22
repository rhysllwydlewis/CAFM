import { Module } from '@nestjs/common';
import { ContractorJobsController } from './contractor-jobs.controller';
import { WorkOrderContractorsController } from './work-order-contractors.controller';
import { WorkOrderCostsController } from './work-order-costs.controller';
import { WorkOrdersController } from './work-orders.controller';

@Module({
  controllers: [
    WorkOrdersController,
    WorkOrderContractorsController,
    WorkOrderCostsController,
    ContractorJobsController,
  ],
})
export class WorkOrdersModule {}
