import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { DisplayController } from './display.controller';
import { ImpersonationController } from './impersonation.controller';

@Module({ controllers: [AdminController, DisplayController, ImpersonationController] })
export class AdminModule {}
