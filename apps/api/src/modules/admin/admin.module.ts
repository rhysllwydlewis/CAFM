import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { BrandingController } from './branding.controller';
import { DisplayController } from './display.controller';
import { ImpersonationController } from './impersonation.controller';
import { SecurityController } from './security.controller';
import { UsernameAccountsController } from './username-accounts.controller';

@Module({
  controllers: [
    AdminController,
    BrandingController,
    DisplayController,
    ImpersonationController,
    SecurityController,
    UsernameAccountsController,
  ],
})
export class AdminModule {}
