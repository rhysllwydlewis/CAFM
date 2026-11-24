import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { DisplayController } from './display.controller';

@Module({ controllers: [AdminController, DisplayController] })
export class AdminModule {}
