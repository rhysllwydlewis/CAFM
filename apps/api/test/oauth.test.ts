import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { MOBILE_CLIENT_ID, MOBILE_DEVICE_LIMIT } from '@fmstead/shared';
import { hashToken } from '../src/core/session';
import { ownerDb, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const owner = ownerDb();
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await owner.$disconnect();
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

  it('rotates refresh tokens, and answers a retry of the last one with a fresh pair', async () => {
    const { res } = await pairDevice('technician@demo.example');
    const first = res.body;
    const second = await refresh(first.refresh_token);
    expect(second.status).toBe(200);
    expect(second.body.refresh_token).not.toBe(first.refresh_token);
    // The old access token stops working at once, the new one works.
    await http().get('/api/auth/me').set('Authorization', `Bearer ${first.access_token}`).expect(401);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${second.body.access_token}`).expect(200);

    // The answer to that refresh may never have reached the phone, so it retries with the old token. Within a short
    // window that is a retry, not theft: it gets a working pair and is not signed out.
    const retry = await refresh(first.refresh_token);
    expect(retry.status).toBe(200);
    expect(retry.body.refresh_token).not.toBe(second.body.refresh_token);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${retry.body.access_token}`).expect(200);
    expect((await refresh(retry.body.refresh_token)).status).toBe(200);
  });

  it('keeps answering the same retry for the whole window, even when the answer to the retry is lost too', async () => {
    const { res } = await pairDevice('technician@demo.example');
    const a = res.body;
    const b = await refresh(a.refresh_token);
    expect(b.status).toBe(200);
    // Nothing reached the phone, so it tries the same token again, and again.
    const c = await refresh(a.refresh_token);
    const d = await refresh(a.refresh_token);
    expect([c.status, d.status]).toEqual([200, 200]);
    // Only the newest pair works, and the earlier ones are refused without signing the device out.
    expect((await refresh(b.body.refresh_token)).status).toBe(400);
    expect((await refresh(c.body.refresh_token)).status).toBe(400);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${d.body.access_token}`).expect(200);
    // The window runs from the first change, so a retry does not stretch it: after it, the token is a replay.
    await owner.mobileDevice.updateMany({
      where: { previousHash: hashToken(a.refresh_token) },
      data: { refreshRotatedAt: new Date(Date.now() - 2 * 60 * 1000) },
    });
    expect((await refresh(a.refresh_token)).status).toBe(400);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${d.body.access_token}`).expect(401);
  });

  it('signs the device out when the previous token is replayed after the window, and refuses older ones', async () => {
    const { res } = await pairDevice('technician@demo.example');
    const first = res.body;
    const second = await refresh(first.refresh_token);
    expect(second.status).toBe(200);
    // Make that change look two minutes old: past the window.
    await owner.mobileDevice.updateMany({
      where: { previousHash: hashToken(first.refresh_token) },
      data: { refreshRotatedAt: new Date(Date.now() - 2 * 60 * 1000) },
    });
    const replay = await refresh(first.refresh_token);
    expect(replay.status).toBe(400);
    // The replay revoked the whole device, including the newest tokens.
    await http().get('/api/auth/me').set('Authorization', `Bearer ${second.body.access_token}`).expect(401);
    expect((await refresh(second.body.refresh_token)).status).toBe(400);

    // A token from two changes back is refused too, though only the previous one is remembered, so it is not a sign-out.
    const other = await pairDevice('technician@demo.example');
    const a = other.res.body;
    const b = await refresh(a.refresh_token);
    const c = await refresh(b.body.refresh_token);
    expect(c.status).toBe(200);
    expect((await refresh(a.refresh_token)).status).toBe(400);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${c.body.access_token}`).expect(200);
  });

  it('keeps at most ten phones signed in for a person, signing out the least recently used', async () => {
    const account = await owner.account.findUniqueOrThrow({ where: { email: 'planner@demo.example' } });
    await owner.session.deleteMany({ where: { accountId: account.id, deviceId: { not: null } } });
    await owner.mobileDevice.deleteMany({ where: { accountId: account.id } });
    const phones = [];
    for (let i = 0; i < MOBILE_DEVICE_LIMIT + 2; i += 1)
      phones.push(await pairDevice('planner@demo.example', `Phone ${i}`));
    const active = await owner.mobileDevice.count({ where: { accountId: account.id, revokedAt: null } });
    expect(active).toBe(MOBILE_DEVICE_LIMIT);
    // The newest works; the two that were never used since are the ones signed out.
    await http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${phones.at(-1)!.res.body.access_token}`)
      .expect(200);
    await http().get('/api/auth/me').set('Authorization', `Bearer ${phones[0]!.res.body.access_token}`).expect(401);
    expect((await refresh(phones[0]!.res.body.refresh_token)).status).toBe(400);
    await owner.session.deleteMany({ where: { accountId: account.id, deviceId: { not: null } } });
    await owner.mobileDevice.deleteMany({ where: { accountId: account.id } });
  });

  it('clears expired approval codes when another is approved', async () => {
    const account = await owner.account.findUniqueOrThrow({ where: { email: 'technician@demo.example' } });
    const membership = await owner.membership.findFirstOrThrow({ where: { accountId: account.id } });
    const stale = await owner.oauthCode.create({
      data: {
        codeHash: `stale-${randomBytes(8).toString('hex')}`,
        codeChallenge: 'x',
        accountId: account.id,
        membershipId: membership.id,
        deviceName: 'Old approval',
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    await pairDevice('technician@demo.example');
    expect(await owner.oauthCode.findUnique({ where: { id: stale.id } })).toBeNull();
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
