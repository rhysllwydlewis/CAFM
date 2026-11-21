import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.disable('x-powered-by');
  // Behind the web app's /api proxy, trust the first hop for the client IP.
  app.set('trust proxy', 1);
  app.enableShutdownHooks();
  return app;
}
