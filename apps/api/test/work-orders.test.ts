import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { createTestAccount, createTestTenant, ownerDb, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const jobs = '/api/work-orders';
const helpdesk = '/api/helpdesk';

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

async function fixture() {
  const { tenant, cleanup } = await createTestTenant(db);
  const accounts = {
    admin: await createTestAccount(db, [tenant.id], undefined, 'super_user'),
    manager: await createTestAccount(db, [tenant.id], undefined, 'fm_manager'),
    desk: await createTestAccount(db, [tenant.id], undefined, 'helpdesk'),
    tech: await createTestAccount(db, [tenant.id], undefined, 'technician'),
    other: await createTestAccount(db, [tenant.id], undefined, 'technician'),
    reporter: await createTestAccount(db, [tenant.id], undefined, 'requester'),
  };
  const logIn = async ({ email, password }: { email: string; password: string }) =>
    (await signIn(app, email, password)).agent;
  const [admin, manager, desk, tech, other, reporter] = await Promise.all(Object.values(accounts).map(logIn));
  const site = (await admin!.post('/api/locations').send({ code: 'MAIN', name: 'Main site', kind: 'site' }).expect(201))
    .body;
  const annex = (await admin!.post('/api/locations').send({ code: 'ANNEX', name: 'Annex', kind: 'site' }).expect(201))
    .body;
  // Technicians only work where they have been given access.
  await admin!
    .put('/api/locations/access/' + accounts.tech.memberships[0])
    .send({ locationIds: [site.id] })
    .expect(200);
  await admin!
    .put('/api/locations/access/' + accounts.other.memberships[0])
    .send({ locationIds: [annex.id] })
    .expect(200);
  const requestType = (
    await admin!
      .post(helpdesk + '/settings/types')
      .send({ name: 'Water leak', category: 'Plumbing', problemCode: 'Leak' })
      .expect(201)
  ).body;
  const member = (name: keyof typeof accounts) => accounts[name].memberships[0]!;
  const job = (overrides: Record<string, unknown> = {}) => ({
    submissionId: randomUUID(),
    title: 'Replace pump seal',
    description: 'Pump in the plant room is weeping.',
    locationId: site.id,
    impact: 2,
    urgency: 2,
    ...overrides,
  });
  const report = async (overrides: Record<string, unknown> = {}) =>
    (
      await reporter!
        .post(helpdesk + '/requests')
        .send({
          submissionId: randomUUID(),
          title: 'Water leak',
          description: 'Water near a socket.',
          locationId: site.id,
          typeId: requestType.id,
          ...overrides,
        })
        .expect(201)
    ).body;
  return {
    tenant,
    cleanup,
    admin: admin!,
    manager: manager!,
    desk: desk!,
    tech: tech!,
    other: other!,
    reporter: reporter!,
    site,
    annex,
    member,
    job,
    report,
  };
}

it('raises a job, sets the targets from the priority matrix and returns the same job for a retry', async () => {
  const { manager, tech, reporter, cleanup, site, job } = await fixture();
  try {
    const input = job();
    const created = (await manager.post(jobs).send(input).expect(201)).body;
    expect(created).toMatchObject({
      status: 'logged',
      title: 'Replace pump seal',
      priority: 3,
      location: { id: site.id, code: 'MAIN' },
      assigneeId: null,
      asset: null,
      request: null,
    });
    expect(created.number).toMatch(/^WO-\d{5}$/);
    expect(Date.parse(created.responseDueAt)).toBeGreaterThan(Date.now());
    expect(Date.parse(created.attendDueAt)).toBeGreaterThanOrEqual(Date.parse(created.responseDueAt));
    expect(Date.parse(created.fixDueAt)).toBeGreaterThanOrEqual(Date.parse(created.attendDueAt));

    expect((await manager.post(jobs).send(input).expect(201)).body.id).toBe(created.id);
    await manager
      .post(jobs)
      .send({ ...input, title: 'A different job' })
      .expect(409);
    // Roles without the permission cannot raise jobs, and unsupported fields are refused.
    await tech.post(jobs).send(job()).expect(403);
    await reporter.post(jobs).send(job()).expect(403);
    await manager
      .post(jobs)
      .send({ ...job(), status: 'completed' })
      .expect(400);
    await manager
      .post(jobs)
      .send(job({ impact: 4 }))
      .expect(400);
    await manager
      .post(jobs)
      .send(job({ locationId: randomUUID() }))
      .expect(404);
  } finally {
    await cleanup();
  }
});

it('takes a job from logged to closed, with only the right people allowed each step', async () => {
  const { manager, desk, tech, other, reporter, cleanup, member, job } = await fixture();
  try {
    const created = (await manager.post(jobs).send(job()).expect(201)).body;
    const url = jobs + '/' + created.id;
    const detail = async (agent = manager) => (await agent.get(url).expect(200)).body;
    expect((await detail()).nextStatuses).toEqual(['cancelled']);

    // Assigning needs the assign permission and someone who can do the job at that location.
    await tech
      .post(url + '/assign')
      .send({ version: 1, assigneeId: member('tech') })
      .expect(403);
    await manager
      .post(url + '/assign')
      .send({ version: 1, assigneeId: member('reporter') })
      .expect(404);
    await manager
      .post(url + '/assign')
      .send({ version: 1, assigneeId: member('other') })
      .expect(404);
    const assigned = (
      await desk
        .post(url + '/assign')
        .send({ version: 1, assigneeId: member('tech') })
        .expect(201)
    ).body;
    expect(assigned).toMatchObject({ status: 'assigned', assigneeId: member('tech') });
    await desk
      .post(url + '/assign')
      .send({ version: 1, assigneeId: member('tech') })
      .expect(409);

    // The technician sees the job and can do it, but not verify or cancel it.
    const asTech = await detail(tech);
    expect(asTech.nextStatuses).toEqual(['accepted', 'travelling', 'on_site', 'paused']);
    await tech
      .post(url + '/status')
      .send({ version: 2, status: 'cancelled' })
      .expect(422);
    await tech
      .post(url + '/status')
      .send({ version: 2, status: 'completed' })
      .expect(422);
    await tech
      .post(url + '/status')
      .send({ version: 2, status: 'paused' })
      .expect(400);
    await tech
      .post(url + '/status')
      .send({ version: 2, status: 'accepted', pauseReason: 'other' })
      .expect(400);
    await tech
      .post(url + '/status')
      .send({ version: 1, status: 'accepted' })
      .expect(409);
    await tech
      .post(url + '/status')
      .send({ version: 2, status: 'accepted' })
      .expect(201);
    await tech
      .post(url + '/status')
      .send({ version: 3, status: 'on_site' })
      .expect(201);
    expect(await detail()).toMatchObject({ status: 'on_site', attendedAt: expect.any(String) });
    await tech
      .post(url + '/status')
      .send({ version: 4, status: 'paused', pauseReason: 'awaiting_parts', note: 'Seal ordered' })
      .expect(201);
    expect(await detail()).toMatchObject({ status: 'paused', pauseReason: 'awaiting_parts' });
    await tech
      .post(url + '/status')
      .send({ version: 5, status: 'on_site' })
      .expect(201);
    expect((await detail()).pauseReason).toBeNull();
    await tech
      .post(url + '/status')
      .send({ version: 6, status: 'completed' })
      .expect(201);
    expect(await detail(tech)).toMatchObject({ status: 'completed', completedAt: expect.any(String) });
    // Jobs cannot skip steps, and someone else's technician cannot see it at all.
    await manager
      .post(url + '/status')
      .send({ version: 7, status: 'logged' })
      .expect(422);
    await other.get(url).expect(404);
    await reporter.get(url).expect(403);

    await tech
      .post(url + '/comments')
      .send({ body: 'Seal replaced and pressure tested.' })
      .expect(201);
    await manager
      .post(url + '/comments')
      .send({ body: 'Check the guard.', internal: true })
      .expect(201);
    await reporter
      .post(url + '/comments')
      .send({ body: 'Hello' })
      .expect(403);

    await manager
      .post(url + '/status')
      .send({ version: 7, status: 'verified' })
      .expect(201);
    await manager
      .post(url + '/status')
      .send({ version: 8, status: 'closed' })
      .expect(201);
    const closed = await detail();
    expect(closed).toMatchObject({ status: 'closed', closedAt: expect.any(String), nextStatuses: [] });
    expect(closed.entries.map(({ body }: { body: string }) => body)).toEqual([
      'Work order raised',
      expect.stringMatching(/^Assigned to /),
      'Accepted',
      'On site',
      'Paused · Awaiting parts · Seal ordered',
      'On site',
      'Completed',
      'Seal replaced and pressure tested.',
      'Check the guard.',
      'Verified',
      'Closed',
    ]);
    await manager.patch(url).send({ version: 9, title: 'Too late' }).expect(422);
    await manager
      .post(url + '/status')
      .send({ version: 9, status: 'on_site' })
      .expect(422);
  } finally {
    await cleanup();
  }
});

it('lets a job be edited and re-triaged, which recalculates its targets, and reassigned before work starts', async () => {
  const { manager, desk, tech, cleanup, member, job, annex, site } = await fixture();
  try {
    const created = (await manager.post(jobs).send(job()).expect(201)).body;
    const url = jobs + '/' + created.id;
    await tech.patch(url).send({ version: 1, title: 'Nope' }).expect(403);
    await manager.patch(url).send({ version: 1 }).expect(400);
    await manager.patch(url).send({ version: 1, impact: 1 }).expect(400);
    await manager.patch(url).send({ version: 1, assetId: randomUUID() }).expect(404);
    const urgent = (await manager.patch(url).send({ version: 1, impact: 1, urgency: 1 }).expect(200)).body;
    expect(urgent.priority).toBe(1);
    expect(Date.parse(urgent.fixDueAt)).toBeLessThan(Date.parse(created.fixDueAt));
    await manager.patch(url).send({ version: 1, title: 'Stale' }).expect(409);
    expect(
      (await manager.patch(url).send({ version: 2, title: 'Replace pump seal (urgent)' }).expect(200)).body.title,
    ).toBe('Replace pump seal (urgent)');

    await desk
      .post(url + '/assign')
      .send({ version: 3, assigneeId: member('tech') })
      .expect(201);
    // Unassigning returns the job to the queue.
    const cleared = (
      await desk
        .post(url + '/assign')
        .send({ version: 4, assigneeId: null })
        .expect(201)
    ).body;
    expect(cleared).toMatchObject({ status: 'logged', assigneeId: null });
    expect(
      (await manager.get(jobs + '/assignees?locationId=' + site.id).expect(200)).body.map(
        (row: { id: string }) => row.id,
      ),
    ).toEqual(expect.arrayContaining([member('tech')]));
    expect(
      (await manager.get(jobs + '/assignees?locationId=' + annex.id).expect(200)).body.map(
        (row: { id: string }) => row.id,
      ),
    ).not.toContain(member('tech'));
    await tech.get(jobs + '/assignees?locationId=' + site.id).expect(403);
    await manager
      .patch(url)
      .send({ version: 5, title: 'x'.repeat(161) })
      .expect(400);
  } finally {
    await cleanup();
  }
});

it('lists the jobs a person may see, filtered and in pages, with counts for the queue', async () => {
  const { manager, desk, tech, other, cleanup, member, job, annex } = await fixture();
  try {
    const first = (
      await manager
        .post(jobs)
        .send(job({ title: 'Boiler fault' }))
        .expect(201)
    ).body;
    const second = (
      await manager
        .post(jobs)
        .send(job({ title: 'Lift fault', impact: 1, urgency: 1 }))
        .expect(201)
    ).body;
    const third = (
      await manager
        .post(jobs)
        .send(job({ title: 'Annex door', locationId: annex.id }))
        .expect(201)
    ).body;
    await desk
      .post(jobs + '/' + first.id + '/assign')
      .send({ version: 1, assigneeId: member('tech') })
      .expect(201);

    const all = (await manager.get(jobs + '?view=all').expect(200)).body;
    expect(all.items.map(({ title }: { title: string }) => title)).toEqual([
      'Annex door',
      'Lift fault',
      'Boiler fault',
    ]);
    expect(all.counts).toEqual({ open: 3, unassigned: 2, overdue: 0, completedToday: 0 });
    expect((await manager.get(jobs + '?view=unassigned').expect(200)).body.items).toHaveLength(2);
    expect((await manager.get(jobs + '?view=mine').expect(200)).body.items).toHaveLength(0);
    expect((await manager.get(jobs + '?q=lift').expect(200)).body.items.map(({ id }: { id: string }) => id)).toEqual([
      second.id,
    ]);
    expect((await manager.get(jobs + '?priority=1').expect(200)).body.items).toHaveLength(1);
    expect(
      (await manager.get(jobs + '?locationId=' + annex.id).expect(200)).body.items.map(({ id }: { id: string }) => id),
    ).toEqual([third.id]);
    await manager.get(jobs + '?view=nonsense').expect(400);

    const page = (await manager.get(jobs + '?limit=2').expect(200)).body;
    expect(page.items).toHaveLength(2);
    const rest = (await manager.get(jobs + '?limit=2&cursor=' + page.nextCursor).expect(200)).body;
    expect(rest.items.map(({ id }: { id: string }) => id)).toEqual([first.id]);
    expect(rest.nextCursor).toBeNull();
    expect(rest.counts).toBeUndefined();
    // An unknown cursor starts again rather than failing.
    expect((await manager.get(jobs + '?cursor=' + randomUUID()).expect(200)).body.cursorReset).toBe(true);

    // A technician sees only their own jobs; one with a different site sees none of these.
    expect((await tech.get(jobs).expect(200)).body.items.map(({ id }: { id: string }) => id)).toEqual([first.id]);
    expect((await tech.get(jobs).expect(200)).body.counts).toMatchObject({ open: 1 });
    expect((await other.get(jobs + '?view=all').expect(200)).body.items).toEqual([]);
    await tech.get(jobs + '/' + second.id).expect(404);
    await other.get(jobs + '/' + first.id).expect(404);
    await other
      .post(jobs + '/' + first.id + '/status')
      .send({ version: 2, status: 'accepted' })
      .expect(404);
  } finally {
    await cleanup();
  }
});

it('turns a request into several jobs, keeps the request in step and tells the requester', async () => {
  const { manager, desk, tech, reporter, admin, cleanup, member, report, tenant } = await fixture();
  try {
    const request = await report();
    const url = jobs + '/from-request/' + request.id;
    const submissionId = randomUUID();
    const body = {
      submissionId,
      requestVersion: 1,
      jobs: [{ title: 'Stop the leak', assigneeId: member('tech') }, { title: 'Dry out the wall' }],
    };
    await reporter.post(url).send(body).expect(403);
    await tech.post(url).send(body).expect(403);
    // An unknown request is not found, even for someone who may convert requests.
    await admin
      .post(jobs + '/from-request/' + randomUUID())
      .send(body)
      .expect(404);
    await desk
      .post(url)
      .send({ ...body, jobs: [] })
      .expect(400);
    await desk
      .post(url)
      .send({ ...body, requestVersion: 9 })
      .expect(409);

    const created = (await desk.post(url).send(body).expect(201)).body;
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ title: 'Stop the leak', status: 'assigned', request: { id: request.id } });
    expect(created[1]).toMatchObject({ title: 'Dry out the wall', status: 'logged' });
    // The jobs carry the request's priority and targets, so the clock does not restart.
    expect(created[0]).toMatchObject({ priority: request.priority, fixDueAt: expect.any(String) });
    expect(Date.parse(created[0].fixDueAt)).toBe(
      Date.parse((await desk.get(helpdesk + '/requests/' + request.id).expect(200)).body.fixDueAt),
    );

    // A retry returns the same jobs, and a changed retry is refused.
    expect((await desk.post(url).send(body).expect(201)).body.map(({ id }: { id: string }) => id)).toEqual(
      created.map(({ id }: { id: string }) => id),
    );
    await desk
      .post(url)
      .send({ ...body, jobs: [{ title: 'Something else' }, { title: 'Dry out the wall' }] })
      .expect(409);

    const afterConvert = (await desk.get(helpdesk + '/requests/' + request.id).expect(200)).body;
    expect(afterConvert.status).toBe('in_progress');
    expect(afterConvert.entries.map(({ body: text }: { body: string }) => text)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Raised work orders WO-/), 'In progress']),
    );
    // The requester is told it is in progress, and cannot see the internal note about the jobs.
    const mine = (await reporter.get(helpdesk + '/mine/' + request.id).expect(200)).body;
    expect(mine.entries.map(({ body: text }: { body: string }) => text)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^Raised work order/)]),
    );
    expect(await notificationTitles(tenant.id, request.id)).toEqual(
      expect.arrayContaining([expect.stringContaining('updated')]),
    );

    // The request completes only when every job is done.
    const [stop, dry] = created as { id: string }[];
    // Read the version first: a request is opened on its own connection when it is built.
    const move = async (agent: typeof manager, id: string, status: string) => {
      const version = await versionOf(agent, id);
      await agent
        .post(jobs + '/' + id + '/status')
        .send({ version, status })
        .expect(201);
    };
    const requestStatus = async () => (await desk.get(helpdesk + '/requests/' + request.id).expect(200)).body.status;
    await move(tech, stop!.id, 'on_site');
    await move(tech, stop!.id, 'completed');
    expect(await requestStatus()).toBe('in_progress');
    const dryVersion = await versionOf(manager, dry!.id);
    await desk
      .post(jobs + '/' + dry!.id + '/assign')
      .send({ version: dryVersion, assigneeId: member('tech') })
      .expect(201);
    await move(tech, dry!.id, 'on_site');
    await move(tech, dry!.id, 'completed');
    expect(await requestStatus()).toBe('completed');
    expect(await notificationTitles(tenant.id, request.id)).toEqual(
      expect.arrayContaining([expect.stringContaining('completed')]),
    );

    // Reopening a job reopens the request, and a closed request cannot be converted again.
    await move(manager, dry!.id, 'on_site');
    expect(await requestStatus()).toBe('in_progress');
    const closed = await report();
    await desk
      .patch(helpdesk + '/requests/' + closed.id)
      .send({ version: 1, status: 'rejected', note: 'Duplicate' })
      .expect(200);
    await desk
      .post(jobs + '/from-request/' + closed.id)
      .send({ submissionId: randomUUID(), requestVersion: 2, jobs: [{}] })
      .expect(422);
  } finally {
    await cleanup();
  }

  async function versionOf(agent: typeof manager, id: string): Promise<number> {
    return (await agent.get(jobs + '/' + id).expect(200)).body.version;
  }
  async function notificationTitles(tenantId: string, requestId: string): Promise<string[]> {
    const rows = await withTenant(db, tenantId, (tx) => tx.notification.findMany({ where: { requestId } }));
    return rows.map(({ title }) => title);
  }
});

it('keeps jobs, assignments and notes inside the organisation that owns them', async () => {
  const { manager, cleanup, job } = await fixture();
  const stranger = await fixture();
  try {
    const created = (await manager.post(jobs).send(job()).expect(201)).body;
    const url = jobs + '/' + created.id;
    // The other organisation's super user can see nothing of this one.
    await stranger.admin.get(url).expect(404);
    expect((await stranger.admin.get(jobs + '?view=all').expect(200)).body.items).toEqual([]);
    await stranger.admin.patch(url).send({ version: 1, title: 'Hijacked' }).expect(404);
    await stranger.admin
      .post(url + '/status')
      .send({ version: 1, status: 'cancelled' })
      .expect(404);
    await stranger.admin
      .post(url + '/assign')
      .send({ version: 1, assigneeId: stranger.member('tech') })
      .expect(404);
    await stranger.admin
      .post(url + '/comments')
      .send({ body: 'Hello' })
      .expect(404);
    // Nor can it raise a job at this organisation's location, or against its request.
    await stranger.admin
      .post(jobs)
      .send(job({ locationId: created.location.id }))
      .expect(404);
    await stranger.admin
      .post(jobs + '/from-request/' + randomUUID())
      .send({ submissionId: randomUUID(), requestVersion: 1, jobs: [{}] })
      .expect(404);
    expect((await manager.get(url).expect(200)).body).toMatchObject({ title: 'Replace pump seal', version: 1 });
  } finally {
    await stranger.cleanup();
    await cleanup();
  }
});

it('refuses work orders when the plan does not include them', async () => {
  const { tenant, cleanup } = await createTestTenant(db);
  const admin = await createTestAccount(db, [tenant.id], undefined, 'super_user');
  try {
    const owner = ownerDb();
    try {
      await owner.tenantEntitlement.create({ data: { tenantId: tenant.id, feature: 'work_orders', enabled: false } });
    } finally {
      await owner.$disconnect();
    }
    const agent = (await signIn(app, admin.email, admin.password)).agent;
    await agent.get(jobs).expect(403);
    await agent.post(jobs).send({}).expect(403);
  } finally {
    await cleanup();
  }
});
