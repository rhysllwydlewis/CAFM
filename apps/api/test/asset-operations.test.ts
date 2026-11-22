import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestAccount, createTestTenant, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
  'base64',
);
const scan = '/api/asset-tags/resolve';

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

async function fixture() {
  const { tenant, cleanup } = await createTestTenant(db);
  const logIn = async (role: string) => {
    const account = await createTestAccount(db, [tenant.id], undefined, role);
    return { ...account, agent: (await signIn(app, account.email, account.password)).agent };
  };
  const { agent: admin } = await logIn('super_user');
  const makeSite = async (code: string) =>
    (await admin.post('/api/locations').send({ code, name: code, kind: 'site' }).expect(201)).body.id as string;
  const [site, annex] = [await makeSite('SITE'), await makeSite('ANNEX')];
  const asset = (await admin.post('/api/assets').send({ locationId: site, name: 'Metered pump' }).expect(201)).body;
  return { tenant, cleanup, admin, logIn, site, annex, asset, base: '/api/assets/' + asset.id };
}

it('links a QR, barcode and NFC tag to the current asset, then retires without allowing reuse', async () => {
  const { tenant, admin, cleanup, site, annex, asset, base, logIn } = await fixture();
  const outsider = await fixture();
  try {
    const { agent: requester, memberships } = await logIn('requester');
    const qr = (
      await admin
        .post(base + '/operations/tags')
        .send({ kind: 'qr', code: ' pump-qr ' })
        .expect(201)
    ).body;
    const barcode = (
      await admin
        .post(base + '/operations/tags')
        .send({ kind: 'barcode', code: 'PUMP-BAR' })
        .expect(201)
    ).body;
    const nfc = (
      await admin
        .post(base + '/operations/tags')
        .send({ kind: 'nfc', code: 'PUMP-NFC' })
        .expect(201)
    ).body;
    expect((await admin.get('/api/asset-tags/labels?q=pump-nfc').expect(200)).body.items).toMatchObject([
      { id: nfc.id, asset: { id: asset.id } },
    ]);
    await requester.get('/api/asset-tags/labels').expect(403);
    expect((await admin.get('/api/assets?q=pump-bar').expect(200)).body.items).toMatchObject([{ id: asset.id }]);
    for (const id of [qr.id, nfc.id]) {
      expect((await requester.get(scan).query({ id }).expect(200)).body).toEqual({
        assetId: asset.id,
        destination: 'report',
      });
      await outsider.admin.get(scan).query({ id }).expect(404);
    }
    expect((await requester.get(scan).query({ code: barcode.code.toLowerCase() }).expect(200)).body.assetId).toBe(
      asset.id,
    );
    await requester
      .post(base + '/operations/tags')
      .send({ kind: 'qr', code: 'DENIED' })
      .expect(403);
    await withTenant(db, tenant.id, async (tx) => {
      await tx.membership.update({ where: { id: memberships[0]! }, data: { locationScoped: true } });
      await tx.membershipSite.create({
        data: { tenantId: tenant.id, membershipId: memberships[0]!, locationId: annex },
      });
    });
    await requester.get(scan).query({ id: qr.id }).expect(404);
    await withTenant(db, tenant.id, (tx) =>
      tx.membershipSite.create({ data: { tenantId: tenant.id, membershipId: memberships[0]!, locationId: site } }),
    );
    await requester.get(scan).query({ id: qr.id }).expect(200);
    await admin
      .patch(base + '/operations/tags/' + qr.id + '/retire')
      .send({})
      .expect(200);
    await requester.get(scan).query({ id: qr.id }).expect(404);
    await admin
      .post(base + '/operations/tags')
      .send({ kind: 'barcode', code: 'PUMP-QR' })
      .expect(409);
  } finally {
    await outsider.cleanup();
    await cleanup();
  }
});

it('allows scoped technicians to record precise readings, rejects invalid history and handles retries', async () => {
  const { tenant, admin, cleanup, site, base, logIn } = await fixture();
  try {
    const { agent: technician, memberships } = await logIn('technician');
    const meter = (
      await admin
        .post(base + '/operations/meters')
        .send({ name: 'Run hours', unit: 'h', rolloverAt: '1000' })
        .expect(201)
    ).body;
    const endpoint = base + '/operations/meters/' + meter.id + '/readings';
    const first = {
      value: '999.999999',
      recordedAt: '2026-01-02T12:00:00Z',
      submission: randomUUID(),
      rolledOver: false,
    };
    await technician.post(endpoint).send(first).expect(404);
    await withTenant(db, tenant.id, (tx) =>
      tx.membershipSite.create({ data: { tenantId: tenant.id, membershipId: memberships[0]!, locationId: site } }),
    );
    await technician
      .post(base + '/operations/meters')
      .send({ name: 'Not authorised', unit: 'm', rolloverAt: null })
      .expect(403);
    await technician
      .post(endpoint)
      .send({ ...first, rolledOver: true })
      .expect(422);
    const baseline = (await technician.post(endpoint).send(first).expect(201)).body;
    expect((await technician.post(endpoint).send(first).expect(201)).body).toEqual(baseline);
    await technician
      .post(endpoint)
      .send({ ...first, value: '999' })
      .expect(409);
    const next = { value: '0.000001', recordedAt: '2026-01-02T12:01:00Z', submission: randomUUID(), rolledOver: false };
    await technician.post(endpoint).send(next).expect(422);
    const reading = (
      await technician
        .post(endpoint)
        .send({ ...next, rolledOver: true })
        .expect(201)
    ).body;
    expect(reading).toMatchObject({ value: '0.000001', total: '1000.000001', rolledOver: true });
    await technician
      .post(endpoint)
      .send({ ...next, submission: randomUUID(), recordedAt: '2026-01-02T11:00:00Z' })
      .expect(422);
    expect((await admin.get(endpoint).query({ before: reading.recordedAt }).expect(200)).body.items).toEqual([
      baseline,
    ]);
  } finally {
    await cleanup();
  }
});

it('updates warranty and claim records with optimistic concurrency', async () => {
  const { admin, cleanup, base } = await fixture();
  try {
    const endpoint = base + '/operations/warranties';
    const input = {
      provider: 'Pump Group',
      reference: 'WTY-41',
      startsOn: '2026-01-01',
      expiresOn: '2027-01-01',
      noticeDays: 45,
      active: true,
      notes: null,
    };
    await admin
      .post(endpoint)
      .send({ ...input, expiresOn: '2025-12-31' })
      .expect(422);
    const warranty = (await admin.post(endpoint).send(input).expect(201)).body;
    const form = { reference: 'CLAIM-123', filedOn: '2026-01-12', status: 'submitted', notes: null };
    const claims = endpoint + '/' + warranty.id + '/claims';
    const claim = (await admin.post(claims).send(form).expect(201)).body;
    await admin
      .post(claims)
      .send({ ...form, reference: 'claim-123' })
      .expect(409);
    await admin
      .patch(claims + '/' + claim.id)
      .send({ ...form, status: 'accepted', version: 1 })
      .expect(200);
    await admin
      .patch(claims + '/' + claim.id)
      .send({ ...form, status: 'closed', version: 1 })
      .expect(409);
    await admin
      .patch(endpoint + '/' + warranty.id)
      .send({ ...input, expiresOn: '2027-02-01', version: 1 })
      .expect(200);
    await admin
      .patch(endpoint + '/' + warranty.id)
      .send({ ...input, version: 1 })
      .expect(409);
    expect((await admin.get(base + '/operations').expect(200)).body.warranties).toMatchObject([
      { id: warranty.id, expiresOn: '2027-02-01', claims: [{ id: claim.id, status: 'accepted' }] },
    ]);
  } finally {
    await cleanup();
  }
});

it('stores tenant-scoped documents and lets only the reporter and scoped Helpdesk read a request photo', async () => {
  const { admin, cleanup, site, asset, base, logIn } = await fixture();
  const outsider = await fixture();
  try {
    const path = base + '/attachments';
    const upload = () => admin.put(path).attach('file', png, 'pump.png').expect(200);
    const [first, replay] = await Promise.all([upload(), upload()]);
    expect(replay.body.id).toBe(first.body.id);
    const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
    await admin.put(path).attach('file', pdf, 'manual.pdf').expect(200);
    await admin.put(path).attach('file', Buffer.from('<svg/>'), 'no.svg').expect(415);
    const download = await admin.get(path + '/' + first.body.id).expect(200);
    expect(download.body).toEqual(png);
    expect(download.headers['content-disposition']).toContain("attachment; filename*=UTF-8''pump.png");
    expect(download.headers['cache-control']).toBe('private, no-store');
    await outsider.admin.get(path + '/' + first.body.id).expect(404);
    await outsider.admin.get(outsider.base + '/attachments/' + first.body.id).expect(404);
    const { agent: requester } = await logIn('requester');
    const { agent: bystander } = await logIn('requester');
    await requester.get(path).expect(403);
    const typeId = (
      await admin
        .post('/api/helpdesk/settings/types')
        .send({ name: 'Pump fault', category: 'Plant', problemCode: 'Pump' })
        .expect(201)
    ).body.id;
    const ticket = (
      await requester
        .post('/api/helpdesk/requests')
        .send({
          title: 'Water beside pump',
          description: 'Water beside pump',
          submissionId: randomUUID(),
          locationId: site,
          assetId: asset.id,
          typeId,
          channel: 'qr',
        })
        .expect(201)
    ).body;
    const own = '/api/helpdesk/mine/' + ticket.id + '/attachments';
    const staff = '/api/helpdesk/requests/' + ticket.id + '/attachments';
    await requester.put(own).attach('file', pdf, 'manual.pdf').expect(415);
    await requester.put(own).set('Origin', 'https://untrusted.example').attach('file', png, 'x.png').expect(403);
    const photo = (await requester.put(own).attach('file', png, 'fault.png').expect(200)).body;
    await bystander.get(own + '/' + photo.id).expect(404);
    await bystander.put(own).attach('file', png, 'fault.png').expect(404);
    await outsider.admin.get(staff).expect(404);
    expect((await admin.get(staff + '/' + photo.id).expect(200)).body).toEqual(png);
  } finally {
    await outsider.cleanup();
    await cleanup();
  }
});

it('removes asset expiry alerts from the inbox when the recipient loses branch access', async () => {
  const { tenant, asset, logIn, site, annex, cleanup } = await fixture();
  try {
    const { agent, memberships } = await logIn('fm_manager');
    const recipientId = memberships[0]!;
    const notice = await withTenant(db, tenant.id, (tx) =>
      tx.notification.create({
        data: {
          tenantId: tenant.id,
          recipientId,
          assetId: asset.id,
          title: 'Asset warranty expiring',
          body: 'Open the warranty record to check the expiry.',
          eventKey: 'expiry-test',
        },
      }),
    );
    const path = '/api/notifications';
    expect((await agent.get(path).expect(200)).body).toMatchObject({
      unread: 1,
      items: [{ id: notice.id, assetId: asset.id }],
    });
    await withTenant(db, tenant.id, async (tx) => {
      await tx.membership.update({ where: { id: recipientId }, data: { locationScoped: true } });
      await tx.membershipSite.create({ data: { tenantId: tenant.id, membershipId: recipientId, locationId: annex } });
    });
    expect((await agent.get(path).expect(200)).body).toMatchObject({ unread: 0, items: [] });
    await agent
      .patch(path + '/' + notice.id + '/read')
      .send({})
      .expect(404);
    await withTenant(db, tenant.id, (tx) =>
      tx.membershipSite.create({ data: { tenantId: tenant.id, membershipId: recipientId, locationId: site } }),
    );
    await agent
      .patch(path + '/' + notice.id + '/read')
      .send({})
      .expect(200);
    expect((await agent.get(path).expect(200)).body).toMatchObject({ unread: 0, items: [{ id: notice.id }] });
  } finally {
    await cleanup();
  }
});
