import { Module } from '@nestjs/common';
import { FieldsController } from './fields.controller';
import { NumberingController } from './numbering.controller';

@Module({ controllers: [FieldsController, NumberingController] })
export class ConfigEngineModule {}
