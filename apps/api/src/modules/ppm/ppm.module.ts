import { Module } from '@nestjs/common';
import { PpmImportController } from './ppm-import.controller';
import { PpmPlannerController } from './ppm-planner.controller';
import { PpmGenerateController, PpmSchedulesController } from './ppm-schedules.controller';
import { PpmTemplatesController } from './ppm-templates.controller';

@Module({
  controllers: [
    PpmTemplatesController,
    PpmImportController,
    PpmSchedulesController,
    PpmGenerateController,
    PpmPlannerController,
  ],
})
export class PpmModule {}
