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
  // How many proxies sit in front of the API, so req.ip is the real client:
  // 1 locally (the web app's /api proxy), 2 on Railway (its edge, then the web app).
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.enableShutdownHooks();
  return app;
}
