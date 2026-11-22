import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
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
  const logIn = async ({ email, password }: typeof actor) => (await signIn(app, email, password)).agent;
  const [admin, operator, requester, bystander] = await Promise.all([
    logIn(actor),
    logIn(worker),
    logIn(reporter),
    logIn(other),
  ]);
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
    expect((await operator.get(helpdesk + '/queue-locations').expect(200)).body).toEqual([
      { id: site.id, code: 'MAIN', name: 'Main site' },
    ]);
    await bystander.get(helpdesk + '/queue-filters').expect(403);

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
    const sourceFiles = helpdesk + '/mine/' + source.id + '/attachments';
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
      'base64',
    );
    const photo = (await requester.put(sourceFiles).attach('file', png, 'leak.png').expect(200)).body;
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
    const staffPrimary = (await operator.get(helpdesk + '/requests/' + target.id).expect(200)).body;
    expect(staffPrimary.linkedPhotoReports).toEqual([{ id: source.id, number: source.number }]);
    const reporterPrimary = (await bystander.get(helpdesk + '/mine/' + target.id).expect(200)).body;
    expect(reporterPrimary.linkedPhotoReports).toEqual([]);
    await bystander.get(sourceFiles + '/' + photo.id).expect(404);
    expect((await requester.get(sourceFiles + '/' + photo.id).expect(200)).body).toEqual(png);
    const current = (await requester.get(helpdesk + '/mine/' + source.id).expect(200)).body;
    expect(current.status).toBe('merged');
    expect(JSON.stringify(current)).not.toContain(target.id);
    await requester.get(helpdesk + '/mine/' + target.id).expect(404);
    await bystander.get(helpdesk + '/mine/' + source.id).expect(404);
    await operator
      .post(helpdesk + '/requests/' + target.id + '/merge')
      .send({ targetId: source.id, version: 2, targetVersion: 2 })
      .expect(422);
    const primary = (
      await bystander
        .post(helpdesk + '/requests')
        .send(input({ title: 'Primary account details' }))
        .expect(201)
    ).body;
    await operator
      .post(helpdesk + '/requests/' + target.id + '/merge')
      .send({ targetId: primary.id, version: 2, targetVersion: 1 })
      .expect(201);
    await operator
      .patch(helpdesk + '/requests/' + primary.id)
      .send({ status: 'completed', version: 2 })
      .expect(200);
    const newPrimary = (await operator.get(helpdesk + '/requests/' + primary.id).expect(200)).body;
    expect(newPrimary.linkedPhotoReports).toEqual([{ id: source.id, number: source.number }]);
    const linked = (await requester.get(helpdesk + '/mine/' + source.id).expect(200)).body;
    expect(linked).toMatchObject({ status: 'merged', linkedStatus: 'completed' });
    expect(linked.entries.at(-1).body).toBe('Linked request · Completed');
    expect(JSON.stringify(linked)).not.toContain('Primary account details');
    expect((await requester.get(notifications).expect(200)).body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requestId: source.id, title: expect.stringContaining('completed') }),
      ]),
    );
    await requester
      .post(helpdesk + '/mine/' + source.id + '/rating')
      .send({ rating: 5 })
      .expect(201);
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
    const another = { ...reply, from: 'another@example.test' };
    const anotherRequest = (await deliver(another)).body;
    expect(anotherRequest.requestId).not.toBe(created.requestId);
    expect((await deliver(another)).body).toEqual(anotherRequest);

    // Auto-replies and the mailbox writing to itself must not open requests (or answer each other forever).
    const post = (payload: object) =>
      admin
        .post(url)
        .set('Authorization', 'Bearer ' + token)
        .send(payload)
        .expect(201);
    const requestCount = () => withTenant(db, tenant.id, (tx) => tx.serviceRequest.count());
    const before = await requestCount();
    expect(before).toBeGreaterThan(0);
    const auto = { ...message, from: 'robot@example.test', messageId: '<auto@example.test>', autoSubmitted: true };
    expect((await post(auto)).body).toEqual({ ignored: true });
    expect((await post({ ...auto, autoSubmitted: undefined, from: address })).body).toEqual({ ignored: true });
    expect(await requestCount()).toBe(before);
    await admin
      .post(url)
      .set('Authorization', 'Bearer ' + token)
      .send({ ...auto, autoSubmitted: 'yes' })
      .expect(400);

    const replacement = (
      await admin
        .post(helpdesk + '/settings/types')
        .send({
          name: 'Electrical hazard',
          category: 'Electrical',
          problemCode: 'Hazard',
        })
        .expect(201)
    ).body;
    const triage = { typeId: replacement.id, impact: 1, urgency: 1 };
    await requester
      .patch(helpdesk + '/requests/' + created.requestId)
      .send({ version: 1, triage })
      .expect(403);
    const reclassified = (
      await admin
        .patch(helpdesk + '/requests/' + created.requestId)
        .send({ version: 1, triage })
        .expect(200)
    ).body;
    expect(reclassified).toMatchObject({ priority: 1, firstResponseAt: null, type: { id: replacement.id } });
    expect(Date.parse(reclassified.responseDueAt) - Date.parse(reclassified.createdAt)).toBe(15 * 60_000);
    await admin
      .patch(helpdesk + '/requests/' + created.requestId)
      .send({ status: 'completed', version: 2 })
      .expect(200);
    const acknowledgement = await withTenant(db, tenant.id, (tx) =>
      tx.notification.findFirstOrThrow({ where: { requestId: created.requestId }, orderBy: { createdAt: 'asc' } }),
    );
    const completedReply = {
      ...message,
      messageId: '<completed@example.test>',
      inReplyTo: `<cafm-${acknowledgement.id}@cafm.invalid>`,
      text: 'The repair is working.',
    };
    expect((await deliver(completedReply)).body).toEqual(created);
    const detail = (await admin.get(helpdesk + '/requests/' + created.requestId).expect(200)).body;
    expect(detail.channel).toBe('email');
    expect(detail.entries.map(({ body }: { body: string }) => body)).toEqual([
      'Request received',
      'The leak is worse.',
      'Classification or priority updated',
      'Completed',
      'The repair is working.',
    ]);
  } finally {
    if (old === undefined) delete process.env.HELPDESK_INBOUND_TOKEN;
    else process.env.HELPDESK_INBOUND_TOKEN = old;
    await cleanup();
  }
});

it('continues from a changed queue anchor and recovers a cursor outside the caller’s scope', async () => {
  const { operator, requester, bystander, tenant, cleanup, input } = await fixture();
  try {
    const older = (
      await requester
        .post(helpdesk + '/requests')
        .send(input())
        .expect(201)
    ).body;
    const newer = (
      await bystander
        .post(helpdesk + '/requests')
        .send(input())
        .expect(201)
    ).body;
    await withTenant(db, tenant.id, (tx) =>
      tx.serviceRequest.update({
        where: { id: older.id },
        data: { createdAt: new Date('2026-01-01T00:00:00Z') },
      }),
    );
    const first = (await operator.get(helpdesk + '/requests?limit=1').expect(200)).body;
    expect(first.nextCursor).toBe(newer.id);
    await operator
      .patch(helpdesk + '/requests/' + newer.id)
      .send({ status: 'completed', version: 1 })
      .expect(200);
    const next = (await operator.get(helpdesk + '/requests?limit=1&cursor=' + first.nextCursor).expect(200)).body;
    expect(next.items.map(({ id }: { id: string }) => id)).toEqual([older.id]);
    expect(next.nextCursor).toBeNull();

    const own = (await requester.get(helpdesk + '/mine?cursor=' + newer.id).expect(200)).body;
    expect(own.cursorReset).toBe(true);
    expect(own.items.map(({ id }: { id: string }) => id)).toEqual([older.id]);
  } finally {
    await cleanup();
  }
});

it('shows collected custom fields and preserves submitted question labels after catalogue edits', async () => {
  const { admin, operator, requester, cleanup, requestType, input } = await fixture();
  try {
    const field = (
      await admin
        .post('/api/config/fields')
        .send({
          entityType: 'request',
          key: 'room_reference',
          label: 'Room reference',
          type: 'text',
          required: true,
        })
        .expect(201)
    ).body;
    const created = (
      await requester
        .post(helpdesk + '/requests')
        .send(input({ custom: { room_reference: 'Kitchen 4' } }))
        .expect(201)
    ).body;
    await admin
      .patch(helpdesk + '/settings/types/' + requestType.id)
      .send({
        name: 'Water leak',
        category: 'Plumbing',
        problemCode: 'Leak',
        version: requestType.version,
        questions: [{ key: 'near_electrics', label: 'Updated question' }],
      })
      .expect(200);
    const detail = (await operator.get(helpdesk + '/requests/' + created.id).expect(200)).body;
    expect(detail.answers).toEqual([{ label: 'Is water near electrics?', value: true }]);
    expect(detail.customFields).toMatchObject([{ definition: { key: 'room_reference' }, value: 'Kitchen 4' }]);
    await admin.delete('/api/config/fields/' + field.id).expect(204);
    expect((await requester.get(helpdesk + '/mine/' + created.id).expect(200)).body.customFields).toEqual([]);
  } finally {
    await cleanup();
  }
});

it('binds browser notifications to each signed-in membership sharing an endpoint', async () => {
  const { requester, bystander, cleanup } = await fixture();
  try {
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'local-public-key-fixture');
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', 'local-private-key-fixture');
    vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:notifications@example.test');
    const endpoint = 'https://fcm.googleapis.com/fcm/send/local-fixture';
    const subscription = { endpoint, keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) } };
    await requester
      .post(notifications + '/push')
      .send(subscription)
      .expect(201);
    expect(
      (
        await requester
          .post(notifications + '/push/status')
          .send({ endpoint })
          .expect(201)
      ).body.subscribed,
    ).toBe(true);
    expect(
      (
        await bystander
          .post(notifications + '/push/status')
          .send({ endpoint })
          .expect(201)
      ).body.subscribed,
    ).toBe(false);
    await bystander
      .post(notifications + '/push')
      .send(subscription)
      .expect(201);
    await bystander
      .delete(notifications + '/push')
      .send({ endpoint })
      .expect(200);
    expect(
      (
        await requester
          .post(notifications + '/push/status')
          .send({ endpoint })
          .expect(201)
      ).body.subscribed,
    ).toBe(true);
  } finally {
    vi.unstubAllEnvs();
    await cleanup();
  }
});
