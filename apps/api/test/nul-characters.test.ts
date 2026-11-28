import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { holdsNul } from '../src/core/nul.guard';
import { signIn, startApp } from './helpers';

// Issue #127: Postgres cannot store a NUL character, so one used to come back as a 500. It is a 400 everywhere.

let app: NestExpressApplication;
beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
});

describe('looking for a NUL character', () => {
  it('finds one in a string, a key, an array or an object, however deep', () => {
    expect(holdsNul('a\u0000b')).toBe(true);
    expect(holdsNul({ name: 'a\u0000b' })).toBe(true);
    expect(holdsNul({ 'na\u0000me': 'ok' })).toBe(true);
    expect(holdsNul({ a: [{ b: ['fine', { c: 'x\u0000' }] }] })).toBe(true);
  });
  it('leaves ordinary text, numbers and empty values alone', () => {
    for (const value of [
      'plain',
      '',
      0,
      12,
      true,
      null,
      undefined,
      [],
      {},
      { a: ['b', 1, null] },
      'tab\there \n é 🙂',
    ]) {
      expect(holdsNul(value)).toBe(false);
    }
  });
});

describe('a NUL character in a request', () => {
  it.each([
    '/api/work-orders',
    '/api/assets',
    '/api/locations',
    '/api/helpdesk/requests',
    '/api/helpdesk/contacts',
    '/api/helpdesk/locations',
    '/api/work-orders/locations',
    '/api/ppm/planner',
    '/api/ppm/schedules',
  ])('is a 400 in the search of %s', async (path) => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    const res = await agent.get(`${path}?q=%00`).expect(400);
    expect(res.body.code).toBe('invalid_character');
    // Ordinary searches still work.
    await agent.get(`${path}?q=pump`).expect(200);
  });

  it('is a 400 in a saved name, in any shape of body', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.post('/api/teams').send({ name: 'a\u0000b' }).expect(400);
    await agent
      .post('/api/roles')
      .send({ name: 'a\u0000b', permissions: ['people.read'], scope: 'all' })
      .expect(400);
    await agent
      .post('/api/teams')
      .send({ name: 'ok', memberIds: ['x\u0000'] })
      .expect(400);
    await agent
      .post('/api/teams')
      .send({ nested: { deeper: [{ name: 'a\u0000' }] } })
      .expect(400);
  });

  it('is a 400 in the address itself, and also when no one is signed in', async () => {
    const { agent } = await signIn(app, 'superuser@demo.example');
    await agent.get('/api/work-orders/%00').expect(400);
    const { default: request } = await import('supertest');
    await request(app.getHttpServer()).get('/api/work-orders?q=%00').expect(400);
  });
});
