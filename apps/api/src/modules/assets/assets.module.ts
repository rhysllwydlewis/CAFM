import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AssetAttachmentsController } from './asset-attachments.controller';
import { AssetOperationsController } from './asset-operations.controller';
import { AssetScanController } from './asset-scan.controller';
import { AssetClassesController } from './asset-classes.controller';
import { AssetServesController } from './asset-serves.controller';
import { AssetsController } from './assets.controller';

@Module({
  imports: [AttachmentsModule],
  controllers: [
    AssetsController,
    AssetServesController,
    AssetClassesController,
    AssetOperationsController,
    AssetScanController,
    AssetAttachmentsController,
  ],
})
export class AssetsModule {}
