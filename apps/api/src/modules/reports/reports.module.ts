import { Module } from '@nestjs/common';
import { HomeController } from './home.controller';
import { ReportsController } from './reports.controller';

@Module({ controllers: [ReportsController, HomeController] })
export class ReportsModule {}
