import { Module } from '@nestjs/common';
import { ContractorJobsController } from './contractor-jobs.controller';
import { WorkOrderContractorsController } from './work-order-contractors.controller';
import { WorkOrdersController } from './work-orders.controller';

@Module({ controllers: [WorkOrdersController, WorkOrderContractorsController, ContractorJobsController] })
export class WorkOrdersModule {}
