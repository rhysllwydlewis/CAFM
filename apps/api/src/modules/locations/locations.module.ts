import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationImportController } from './location-import.controller';

@Module({ controllers: [LocationsController, LocationImportController] })
export class LocationsModule {}
