import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CoreModule } from './core/core.module';
import { CsrfGuard } from './core/csrf.guard';
import { HealthController } from './core/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { PeopleModule } from './modules/people/people.module';

@Module({
  imports: [CoreModule, AuthModule, PeopleModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: CsrfGuard }],
})
export class AppModule {}
