import { Module } from '@nestjs/common';
import { AssetClassesController } from './asset-classes.controller';
import { AssetServesController } from './asset-serves.controller';
import { AssetsController } from './assets.controller';

@Module({ controllers: [AssetsController, AssetServesController, AssetClassesController] })
export class AssetsModule {}
