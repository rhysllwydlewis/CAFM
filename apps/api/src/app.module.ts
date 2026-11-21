import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CoreModule } from './core/core.module';
import { CsrfGuard } from './core/csrf.guard';
import { HealthController } from './core/health.controller';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigEngineModule } from './modules/config/config.module';
import { PeopleModule } from './modules/people/people.module';
import { RolesModule } from './modules/roles/roles.module';

@Module({
  imports: [CoreModule, AuthModule, PeopleModule, RolesModule, AuditModule, ConfigEngineModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: CsrfGuard }],
})
export class AppModule {}
