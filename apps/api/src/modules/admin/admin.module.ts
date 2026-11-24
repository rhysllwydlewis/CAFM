import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { BrandingController } from './branding.controller';
import { DisplayController } from './display.controller';
import { ImpersonationController } from './impersonation.controller';

@Module({ controllers: [AdminController, BrandingController, DisplayController, ImpersonationController] })
export class AdminModule {}
