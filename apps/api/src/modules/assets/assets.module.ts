import { Module } from '@nestjs/common';
import { AssetClassesController } from './asset-classes.controller';
import { AssetsController } from './assets.controller';

@Module({ controllers: [AssetsController, AssetClassesController] })
export class AssetsModule {}
