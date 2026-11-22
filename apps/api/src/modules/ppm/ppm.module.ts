import { Module } from '@nestjs/common';
import { PpmPlannerController } from './ppm-planner.controller';
import { PpmGenerateController, PpmSchedulesController } from './ppm-schedules.controller';
import { PpmTemplatesController } from './ppm-templates.controller';

@Module({ controllers: [PpmTemplatesController, PpmSchedulesController, PpmGenerateController, PpmPlannerController] })
export class PpmModule {}
