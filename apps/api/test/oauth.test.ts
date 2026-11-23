import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { MOBILE_CLIENT_ID } from '@cafm/shared';
import { signIn, startApp } from './helpers';

let app: NestExpressApplication;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
});

function pkce() {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** Signs in at a browser, approves a device and swaps the code for tokens. */
async function pairDevice(identifier: string, name = 'Test phone') {
  const { agent } = await signIn(app, identifier);
  const { verifier, challenge } = pkce();
  const auth = await agent
    .post('/api/oauth/authorize')
    .send({ client_id: MOBILE_CLIENT_ID, code_challenge: challenge, code_challenge_method: 'S256', device_name: name })
    .expect(200);
  const exchange = (code: string, codeVerifier = verifier) =>
    http()
      .post('/api/oauth/token')
      .send({ grant_type: 'authorization_code', client_id: MOBILE_CLIENT_ID, code, code_verifier: codeVerifier });
  const res = await exchange(auth.body.code);
  return { agent, verifier, code: auth.body.code as string, exchange, res };
}

const refresh = (token: string) =>
  http()
    .post('/api/oauth/token')
    .send({ grant_type: 'refresh_token', client_id: MOBILE_CLIENT_ID, refresh_token: token });

describe('mobile OAuth with PKCE', () => {
  it('swaps an approved code for tokens that work as a session', async () => {
    const { res } = await pairDevice('technician@demo.example');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
    const me = await http().get('/api/auth/me').set('Authorization', `Bearer ${res.body.access_token}`).expect(200);
    expect(me.body).toMatchObject({ name: 'Tom Price', tenant: { name: 'Demo Estates Ltd' } });
  });

  it('refuses a wrong verifier, and a code can only be used once', async () => {
    const wrong = await pairDevice('technician@demo.example');
    expect(wrong.res.status).toBe(200);
    const { agent } = await signIn(app, 'technician@demo.example');
    const { verifier, challenge } = pkce();
    const a = await agent.post('/api/oauth/authorize').send({
      client_id: MOBILE_CLIENT_ID,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      device_name: 'X',
    });
    const bad = await http().post('/api/oauth/token').send({
      grant_type: 'authorization_code',
      client_id: MOBILE_CLIENT_ID,
      code: a.body.code,
      code_verifier: pkce().verifier,
    });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'invalid_grant' });
    // The failed attempt burned the code, so even the right verifier now fails.
    const again = await http().post('/api/oauth/token').send({
      grant_type: 'authorization_code',
      client_id: MOBILE_CLIENT_ID,
      code: a.body.code,
      code_verifier: verifier,
    });
    expect(again.status).toBe(400);
  });

  it('replays of a used code fail', async () => {
    const p = await pairDevice('technician@demo.example');
    expect((await p.exchange(p.code, p.verifier)).status).toBe(400);
  });

  it('needs a signed-in browser and valid PKCE parameters to approve a device', async () => {
    const { challenge } = pkce();
    const body = {
      client_id: MOBILE_CLIENT_ID,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      device_name: 'X',
    };
    await http().post('/api/oauth/authorize').send(body).expect(401);
    const { agent } = await signIn(app, 'technician@demo.example');
    await agent
      .post('/api/oauth/authorize')
      .send({ ...body, code_challenge_method: 'plain' })
      .expect(400);
    await agent
      .post('/api/oauth/authorize')
      .send({ ...body, code_challenge: 'short' })
      .expect(400);
  });

  it('does not let a device token approve another device', async () => {
    const { res } = await pairDevice('technician@demo.example');
    const { challenge } = pkce();
    await http()
      .post('/api/oauth/authorize')
      .set('Authorization', `Bearer ${res.body.access_token}`)
      .send({ client_id: MOBILE_CLIENT_ID, code_challenge: challenge, code_challenge_method: 'S256', device_name: 'X' })
      .expect(400);
  });

  it('rotates refresh tokens and signs the device out if an old one is replayed', async () => {
    const { res } = await pairDevice('technician@demo.example');
    const first = res.body;
    const second = await refresh(first.refresh_token);
    expect(second.status).toBe(200);
    expect(second.body.refresh_token).not.toBe(first.refresh_token);
    // The old access token stops working at once, the new one works.
    await http().get('/api/auth/me').set('Authorization', `Bearer ${first.access_token}`).expect(401);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${second.body.access_token}`).expect(200);

    const replay = await refresh(first.refresh_token);
    expect(replay.status).toBe(400);
    // The replay revoked the whole device, including the newest tokens.
    await http().get('/api/auth/me').set('Authorization', `Bearer ${second.body.access_token}`).expect(401);
    expect((await refresh(second.body.refresh_token)).status).toBe(400);
  });

  it('lists a person’s own devices and lets them sign one out', async () => {
    const mine = await pairDevice('technician@demo.example', 'Tom’s phone');
    const auth = { Authorization: `Bearer ${mine.res.body.access_token}` };
    const list = await http().get('/api/oauth/devices').set(auth).expect(200);
    expect(list.body.find((d: { name: string }) => d.name === 'Tom’s phone')).toMatchObject({ current: true });
    const id = list.body.find((d: { name: string }) => d.name === 'Tom’s phone').id;

    // Someone else can't see or remove it (cross-account denial).
    const { agent: other } = await signIn(app, 'helpdesk@demo.example');
    const theirs = await other.get('/api/oauth/devices').expect(200);
    expect(theirs.body.find((d: { id: string }) => d.id === id)).toBeUndefined();
    await other.delete(`/api/oauth/devices/${id}`).expect(404);
    await http().get('/api/oauth/devices').expect(401);

    await mine.agent.delete(`/api/oauth/devices/${id}`).expect(204);
    await http().get('/api/auth/me').set(auth).expect(401);
    expect((await refresh(mine.res.body.refresh_token)).status).toBe(400);
  });

  it('revoke signs the device out and never reveals whether a token existed', async () => {
    const { res } = await pairDevice('technician@demo.example');
    await http().post('/api/oauth/revoke').send({ token: res.body.refresh_token }).expect(200);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${res.body.access_token}`).expect(401);
    await http().post('/api/oauth/revoke').send({ token: 'not-a-token' }).expect(200);
  });

  it('refuses unknown clients and malformed bearer headers', async () => {
    await http()
      .post('/api/oauth/token')
      .send({ grant_type: 'refresh_token', client_id: 'other', refresh_token: 'x' })
      .expect(400);
    await http().get('/api/auth/me').set('Authorization', 'Bearer nonsense').expect(401);
    await http().get('/api/auth/me').set('Authorization', 'Basic abc').expect(401);
  });
});
