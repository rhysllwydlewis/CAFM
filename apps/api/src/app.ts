import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';

/** Builds the configured app. Tests may pass a module that imports AppModule plus extras. */
export async function createApp(rootModule: Type<unknown> = AppModule): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(rootModule, {
    logger: ['error', 'warn'],
    bodyParser: false,
  });
  app.setGlobalPrefix('api');
  // Imports send a CSV file as JSON text (up to 90,000 characters), and JSON escaping can multiply its size
  // by six, so the import routes read bodies up to 600 kB. Every other route keeps the 100 kB default.
  app.use('/api/locations/import', json({ limit: '600kb' }));
  app.use(json({ limit: '100kb' }));
  app.use(cookieParser());
  app.disable('x-powered-by');
  // How many proxies sit in front of the API, so req.ip is the real client:
  // 1 locally (the web app's /api proxy), 2 on Railway (its edge, then the web app).
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.enableShutdownHooks();
  return app;
}
