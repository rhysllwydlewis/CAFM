import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CoreModule } from './core/core.module';
import { CsrfGuard } from './core/csrf.guard';
import { HealthController } from './core/health.controller';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigEngineModule } from './modules/config/config.module';
import { AssetsModule } from './modules/assets/assets.module';
import { LocationsModule } from './modules/locations/locations.module';
import { HelpdeskModule } from './modules/helpdesk/helpdesk.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { MobileModule } from './modules/mobile/mobile.module';
import { PpmModule } from './modules/ppm/ppm.module';
import { PeopleModule } from './modules/people/people.module';
import { RolesModule } from './modules/roles/roles.module';

@Module({
  imports: [
    CoreModule,
    AuthModule,
    PeopleModule,
    RolesModule,
    AuditModule,
    ConfigEngineModule,
    LocationsModule,
    AssetsModule,
    HelpdeskModule,
    WorkOrdersModule,
    MobileModule,
    PpmModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: CsrfGuard }],
})
export class AppModule {}
