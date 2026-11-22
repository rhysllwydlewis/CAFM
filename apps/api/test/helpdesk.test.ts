import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { createTestAccount, createTestTenant, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const helpdesk = '/api/helpdesk';
const notifications = '/api/notifications';

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

async function fixture() {
  const { tenant, cleanup } = await createTestTenant(db);
  const actor = await createTestAccount(db, [tenant.id], undefined, 'super_user');
  const worker = await createTestAccount(db, [tenant.id], undefined, 'helpdesk');
  const reporter = await createTestAccount(db, [tenant.id]);
  const other = await createTestAccount(db, [tenant.id]);
  const [admin, operator, requester, bystander] = await Promise.all(
    [actor, worker, reporter, other].map(async ({ email, password }) => (await signIn(app, email, password)).agent),
  );
  const site = (await admin.post('/api/locations').send({ code: 'MAIN', name: 'Main site', kind: 'site' }).expect(201))
    .body;
  const branch = (await admin.post('/api/locations').send({ code: 'ANNEX', name: 'Annex', kind: 'site' }).expect(201))
    .body;
  const requestType = (
    await admin
      .post(helpdesk + '/settings/types')
      .send({
        name: 'Water leak',
        category: 'Plumbing',
        problemCode: 'Leak',
        questions: [
          { key: 'near_electrics', label: 'Is water near electrics?', yesImpact: 1, yesUrgency: 1, required: true },
        ],
      })
      .expect(201)
  ).body;
  const input = (overrides: Record<string, unknown> = {}) => ({
    submissionId: randomUUID(),
    description: 'Water near a socket.',
    title: 'Water leak',
    locationId: site.id,
    typeId: requestType.id,
    answers: { near_electrics: true },
    ...overrides,
  });
  return { admin, operator, requester, bystander, reporter, worker, tenant, cleanup, site, branch, requestType, input };
}

it('opens a request from a scoped QR context, applies triage and deduplicates retries', async () => {
  const { admin, requester, bystander, tenant, cleanup, site, input } = await fixture();
  try {
    await requester.get('/api/locations/' + site.id).expect(403);
    expect((await requester.get(helpdesk + '/locations/' + site.id).expect(200)).body).toEqual({
      id: site.id,
      code: 'MAIN',
      name: 'Main site',
    });
    await requester
      .post(helpdesk + '/requests')
      .send(input({ answers: {} }))
      .expect(422);
    await requester
      .post(helpdesk + '/requests')
      .send(input({ channel: 'phone' }))
      .expect(403);
    await requester
      .post(helpdesk + '/requests')
      .send(input({ assetId: randomUUID() }))
      .expect(404);
    const report = input({ channel: 'qr' });
    const [first, retry] = await Promise.all([
      requester
        .post(helpdesk + '/requests')
        .send(report)
        .expect(201),
      requester
        .post(helpdesk + '/requests')
        .send(report)
        .expect(201),
    ]);
    expect(retry.body.id).toBe(first.body.id);
    expect(first.body).toMatchObject({ priority: 1, status: 'new', channel: 'qr', location: { id: site.id } });
    expect(Date.parse(first.body.responseDueAt) - Date.parse(first.body.createdAt)).toBe(15 * 60_000);
    await requester
      .post(helpdesk + '/requests')
      .send({ ...report, title: 'Changed' })
      .expect(409);
    await bystander.get(helpdesk + '/mine/' + first.body.id).expect(404);
    await requester.get(helpdesk + '/requests').expect(403);
    expect((await admin.get(helpdesk + '/requests?view=unassigned').expect(200)).body.items).toHaveLength(1);
    const inbox = (await requester.get(notifications).expect(200)).body;
    expect(inbox).toMatchObject({ unread: 1, items: [{ requestId: first.body.id, readAt: null }] });
    await bystander
      .patch(notifications + '/' + inbox.items[0].id + '/read')
      .send({})
      .expect(404);
    await requester
      .patch(notifications + '/' + inbox.items[0].id + '/read')
      .send({})
      .expect(200);
    expect((await requester.get(notifications).expect(200)).body.unread).toBe(0);
    expect(
      await withTenant(db, tenant.id, (tx) =>
        tx.outboxMessage.count({
          where: { topic: 'notification.deliver' },
        }),
      ),
    ).toBe(1);
  } finally {
    await cleanup();
  }
});

it('keeps internal notes private, enforces branch grants and rates a completed request once', async () => {
  const { admin, operator, requester, bystander, worker, cleanup, site, branch, input } = await fixture();
  try {
    const own = (
      await requester
        .post(helpdesk + '/requests')
        .send(input())
        .expect(201)
    ).body;
    const outside = (
      await bystander
        .post(helpdesk + '/requests')
        .send(input({ locationId: branch.id }))
        .expect(201)
    ).body;
    await admin
      .put('/api/locations/access/' + worker.memberships[0])
      .send({ locationIds: [site.id] })
      .expect(200);
    await operator.get(helpdesk + '/locations/' + branch.id).expect(404);
    await operator.get(helpdesk + '/requests/' + outside.id).expect(404);
    await operator
      .patch(helpdesk + '/requests/' + outside.id)
      .send({ status: 'completed', version: 1 })
      .expect(404);
    await operator
      .post(helpdesk + '/requests/' + own.id + '/comments')
      .send({ body: 'Staff only', internal: true })
      .expect(201);
    await requester
      .post(helpdesk + '/mine/' + own.id + '/comments')
      .send({ body: 'Bypass', internal: true })
      .expect(403);
    await requester
      .post(helpdesk + '/mine/' + own.id + '/rating')
      .send({ rating: 5 })
      .expect(422);
    await operator
      .patch(helpdesk + '/requests/' + own.id)
      .send({ status: 'completed', version: 1, assigneeId: worker.memberships[0] })
      .expect(200);
    await operator
      .patch(helpdesk + '/requests/' + own.id)
      .send({ status: 'closed', version: 1 })
      .expect(409);
    const ownDetail = (await requester.get(helpdesk + '/mine/' + own.id).expect(200)).body;
    expect(ownDetail.entries.map(({ body }: { body: string }) => body)).toEqual(['Request received', 'Completed']);
    const staffDetail = (await operator.get(helpdesk + '/requests/' + own.id).expect(200)).body;
    expect(staffDetail.entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ body: 'Staff only', internal: true })]),
    );
    await requester
      .post(helpdesk + '/mine/' + own.id + '/rating')
      .send({ rating: 5, feedback: 'Fixed quickly' })
      .expect(201);
    await requester
      .post(helpdesk + '/mine/' + own.id + '/rating')
      .send({ rating: 1 })
      .expect(422);
    expect((await requester.get(helpdesk + '/mine/' + own.id).expect(200)).body.rating).toBe(5);
  } finally {
    await cleanup();
  }
});

it('detects and merges matching requests without exposing the other requester', async () => {
  const { operator, requester, bystander, cleanup, input } = await fixture();
  try {
    const source = (
      await requester
        .post(helpdesk + '/requests')
        .send(input())
        .expect(201)
    ).body;
    const target = (
      await bystander
        .post(helpdesk + '/requests')
        .send(input({ title: 'Other account description' }))
        .expect(201)
    ).body;
    expect((await operator.get(helpdesk + '/requests/' + source.id + '/duplicates').expect(200)).body).toEqual([
      expect.objectContaining({ id: target.id, version: 1 }),
    ]);
    await operator
      .post(helpdesk + '/requests/' + source.id + '/merge')
      .send({ targetId: target.id, version: 1, targetVersion: 1 })
      .expect(201);
    const current = (await requester.get(helpdesk + '/mine/' + source.id).expect(200)).body;
    expect(current.status).toBe('merged');
    expect(JSON.stringify(current)).not.toContain(target.id);
    await requester.get(helpdesk + '/mine/' + target.id).expect(404);
    await bystander.get(helpdesk + '/mine/' + source.id).expect(404);
    await operator
      .post(helpdesk + '/requests/' + target.id + '/merge')
      .send({ targetId: source.id, version: 2, targetVersion: 2 })
      .expect(422);
  } finally {
    await cleanup();
  }
});

it('authenticates inbound mail, deduplicates provider deliveries and threads a verified sender', async () => {
  const { admin, requester, tenant, cleanup, site, requestType } = await fixture();
  const token = randomUUID() + randomUUID();
  const old = process.env.HELPDESK_INBOUND_TOKEN;
  process.env.HELPDESK_INBOUND_TOKEN = token;
  try {
    const address = 'helpdesk@example.test';
    const mailbox = (
      await admin
        .post(helpdesk + '/settings/mailboxes')
        .send({
          address,
          locationId: site.id,
          typeId: requestType.id,
        })
        .expect(201)
    ).body;
    await requester.get(helpdesk + '/settings').expect(403);
    const url = helpdesk + '/inbound/' + tenant.slug + '/' + mailbox.id;
    const message = {
      to: address,
      from: 'reporter@example.test',
      messageId: '<first@example.test>',
      subject: 'Leak from test',
      text: 'Small leak.',
    };
    await admin.post(url).send(message).expect(401);
    const deliver = (payload: typeof message & { inReplyTo?: string }) =>
      admin
        .post(url)
        .set('Authorization', 'Bearer ' + token)
        .send(payload)
        .expect(201);
    const created = (await deliver(message)).body;
    expect((await deliver(message)).body).toEqual(created);
    const reply = {
      ...message,
      messageId: '<reply@example.test>',
      inReplyTo: message.messageId,
      text: 'The leak is worse.',
    };
    expect((await deliver(reply)).body).toEqual(created);
    expect(
      (await deliver({ ...reply, from: 'another@example.test', messageId: '<other@example.test>' })).body.requestId,
    ).not.toBe(created.requestId);
    const detail = (await admin.get(helpdesk + '/requests/' + created.requestId).expect(200)).body;
    expect(detail.channel).toBe('email');
    expect(detail.entries.map(({ body }: { body: string }) => body)).toEqual([
      'Request received',
      'The leak is worse.',
    ]);
  } finally {
    if (old === undefined) delete process.env.HELPDESK_INBOUND_TOKEN;
    else process.env.HELPDESK_INBOUND_TOKEN = old;
    await cleanup();
  }
});
