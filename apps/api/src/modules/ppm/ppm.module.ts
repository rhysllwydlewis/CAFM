import { Module } from '@nestjs/common';
import { PpmGenerateController, PpmSchedulesController } from './ppm-schedules.controller';
import { PpmTemplatesController } from './ppm-templates.controller';

@Module({ controllers: [PpmTemplatesController, PpmSchedulesController, PpmGenerateController] })
export class PpmModule {}
