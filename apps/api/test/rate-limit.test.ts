import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { TOO_MANY_ATTEMPTS } from '@cafm/shared';
import { startApp } from './helpers';

let app: NestExpressApplication;
const original = process.env.LOGIN_FAILURES_PER_IP;

beforeAll(async () => {
  process.env.LOGIN_FAILURES_PER_IP = '3';
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  if (original === undefined) delete process.env.LOGIN_FAILURES_PER_IP;
  else process.env.LOGIN_FAILURES_PER_IP = original;
});

describe('per-IP limit on failed sign-ins', () => {
  it('refuses further attempts from an IP after too many failures, even with the right password', async () => {
    const http = () => request(app.getHttpServer());
    for (let i = 0; i < 3; i++) {
      await http().post('/api/auth/login').send({ identifier: 'nobody@demo.example', password: 'nope' }).expect(401);
    }
    const res = await http()
      .post('/api/auth/login')
      .send({ identifier: 'superuser@demo.example', password: 'CafmDemo!2026' })
      .expect(429);
    expect(res.body.message).toBe(TOO_MANY_ATTEMPTS);
  });
});
