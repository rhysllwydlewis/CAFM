import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import { createTestAccount, createTestTenant, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const views = '/api/views';

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const config = {
  layout: 'list',
  filters: { status: ['open', 'in_progress'], priority: 'p1' },
  sort: { field: 'due_at', dir: 'asc' },
  group: 'status',
  columns: ['number', 'title', 'status'],
};
const body = (overrides: Record<string, unknown> = {}) => ({
  entity: 'work_orders',
  name: 'Urgent and open',
  visibility: 'private',
  config,
  ...overrides,
});

/** The body of an edit: only the fields the API accepts. */
const edit = (view: { name: string; visibility: string; config: unknown; version: number }, patch = {}) => ({
  name: view.name,
  visibility: view.visibility,
  config: view.config,
  version: view.version,
  ...patch,
});

async function fixture() {
  const { tenant, cleanup } = await createTestTenant(db);
  const accounts = {
    manager: await createTestAccount(db, [tenant.id], undefined, 'fm_manager'),
    planner: await createTestAccount(db, [tenant.id], undefined, 'planner'),
    other: await createTestAccount(db, [tenant.id], undefined, 'planner'),
    reporter: await createTestAccount(db, [tenant.id], undefined, 'requester'),
  };
  const logIn = async ({ email, password }: { email: string; password: string }) =>
    (await signIn(app, email, password)).agent;
  const [manager, planner, other, reporter] = await Promise.all(Object.values(accounts).map(logIn));
  return { tenant, cleanup, manager: manager!, planner: planner!, other: other!, reporter: reporter! };
}

it('keeps private views to their owner and shares them only when allowed', async () => {
  const f = await fixture();
  try {
    const mine = (await f.planner.post(views).send(body()).expect(201)).body;
    expect(mine).toMatchObject({ name: 'Urgent and open', visibility: 'private', mine: true, version: 1 });
    expect(mine.config.filters.priority).toBe('p1');

    // A private view is invisible to everyone else, down to its id.
    expect((await f.other.get(views).query({ entity: 'work_orders' }).expect(200)).body).toEqual([]);
    await f.other.put(`${views}/${mine.id}`).send(edit(mine)).expect(404);
    await f.other.delete(`${views}/${mine.id}`).expect(404);

    // A planner can't share. A manager can, and everyone who can see the list then sees it, read-only.
    await f.planner
      .post(views)
      .send(body({ name: 'For all', visibility: 'shared' }))
      .expect(403);
    await f.planner
      .put(`${views}/${mine.id}`)
      .send(edit(mine, { visibility: 'shared' }))
      .expect(403);
    const shared = (
      await f.manager
        .post(views)
        .send(body({ name: 'Team queue', visibility: 'shared' }))
        .expect(201)
    ).body;
    const seen = (await f.other.get(views).query({ entity: 'work_orders' }).expect(200)).body;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ id: shared.id, mine: false });
    await f.other
      .put(`${views}/${shared.id}`)
      .send(edit(shared, { name: 'Mine now' }))
      .expect(403);
    await f.other.delete(`${views}/${shared.id}`).expect(403);

    // The manager can remove a shared view someone else made, but never read or remove a private one.
    const planners = (
      await f.planner
        .post(views)
        .send(body({ name: 'Mine', entity: 'assets', config: { layout: 'list' } }))
        .expect(201)
    ).body;
    await f.manager.delete(`${views}/${planners.id}`).expect(404);
    await f.manager.delete(`${views}/${shared.id}`).expect(200);
  } finally {
    await f.cleanup();
  }
});

it('validates what is stored and guards edits', async () => {
  const f = await fixture();
  try {
    const row = (await f.planner.post(views).send(body()).expect(201)).body;
    await f.planner.post(views).send(body()).expect(409);
    await f.planner
      .post(views)
      .send(body({ name: 'URGENT AND OPEN' }))
      .expect(409);
    await f.planner
      .post(views)
      .send(body({ name: '  ' }))
      .expect(400);
    await f.planner
      .post(views)
      .send(body({ entity: 'documents' }))
      .expect(400);
    await f.planner
      .post(views)
      .send(body({ config: { ...config, filters: { 'bad key!': 'x' } } }))
      .expect(400);
    await f.planner
      .post(views)
      .send(body({ name: 'x', config: { ...config, columns: ['a', 'a'] } }))
      .expect(400);
    await f.planner
      .post(views)
      .send(body({ name: 'x', config: { ...config, script: '<script>' } }))
      .expect(400);

    const updated = (
      await f.planner
        .put(`${views}/${row.id}`)
        .send({ name: 'Renamed', visibility: 'private', config, version: 1 })
        .expect(200)
    ).body;
    expect(updated).toMatchObject({ name: 'Renamed', version: 2 });
    await f.planner
      .put(`${views}/${row.id}`)
      .send({ name: 'Stale', visibility: 'private', config, version: 1 })
      .expect(409);
    await f.planner.delete(`${views}/${row.id}`).expect(200);
    await f.planner.delete(`${views}/${row.id}`).expect(404);

    const events = await withTenant(db, f.tenant.id, (tx) =>
      tx.auditEvent.findMany({
        where: { entityType: 'saved_view' },
        select: { action: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(events.map((e) => e.action)).toEqual(['saved_view.create', 'saved_view.update', 'saved_view.delete']);
  } finally {
    await f.cleanup();
  }
});

it('needs the list’s own permission and a session', async () => {
  const f = await fixture();
  try {
    await f.reporter.get(views).query({ entity: 'work_orders' }).expect(403);
    await f.reporter.post(views).send(body()).expect(403);
    await f.planner.get(views).expect(422);
    await f.planner.get(views).query({ entity: 'nonsense' }).expect(422);
    await f.planner.put(`${views}/not-a-uuid`).send({}).expect(400);
    const anonymous = await import('supertest').then((m) => m.default(app.getHttpServer()));
    await anonymous.get(views).query({ entity: 'assets' }).expect(401);
  } finally {
    await f.cleanup();
  }
});

it('never lets one organisation see or change another’s views', async () => {
  const a = await fixture();
  const b = await fixture();
  try {
    const shared = (
      await a.manager
        .post(views)
        .send(body({ name: 'Ours', visibility: 'shared' }))
        .expect(201)
    ).body;
    const priv = (
      await a.planner
        .post(views)
        .send(body({ name: 'Private' }))
        .expect(201)
    ).body;
    expect((await b.manager.get(views).query({ entity: 'work_orders' }).expect(200)).body).toEqual([]);
    for (const id of [shared.id, priv.id]) {
      await b.manager
        .put(`${views}/${id}`)
        .send({ name: 'Taken', visibility: 'shared', config, version: 1 })
        .expect(404);
      await b.manager.delete(`${views}/${id}`).expect(404);
    }
    expect(await withTenant(db, b.tenant.id, (tx) => tx.savedView.count())).toBe(0);
    expect(await withTenant(db, a.tenant.id, (tx) => tx.savedView.count())).toBe(2);
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
});
