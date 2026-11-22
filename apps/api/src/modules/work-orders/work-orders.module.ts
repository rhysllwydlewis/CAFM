import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { ContractorJobsController } from './contractor-jobs.controller';
import { ChecklistTemplatesController, WorkOrderChecklistsController } from './work-order-checklists.controller';
import { WorkOrderContractorsController } from './work-order-contractors.controller';
import { WorkOrderCostsController } from './work-order-costs.controller';
import { WorkOrderJobSheetController } from './work-order-job-sheet.controller';
import { WorkOrderPhotosController, WorkOrderSignaturesController } from './work-order-evidence.controller';
import { WorkOrdersController } from './work-orders.controller';

@Module({
  imports: [AttachmentsModule],
  controllers: [
    WorkOrdersController,
    WorkOrderContractorsController,
    WorkOrderCostsController,
    WorkOrderChecklistsController,
    ChecklistTemplatesController,
    WorkOrderPhotosController,
    WorkOrderSignaturesController,
    WorkOrderJobSheetController,
    ContractorJobsController,
  ],
})
export class WorkOrdersModule {}
