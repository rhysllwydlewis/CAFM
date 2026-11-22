import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@cafm/db';
import {
  addDays,
  addMonths,
  daysBetween,
  localDate,
  occurrence,
  weekStart,
  type PpmForecast,
  type PpmPlanner,
  type PpmSummary,
} from '@cafm/shared';
import { createTestAccount, createTestTenant, ownerDb, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const today = localDate(new Date(), 'Europe/London');
const monday = weekStart(today);
const jobs = '/api/work-orders';
const schedules = '/api/ppm/schedules';

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
    planner: await createTestAccount(db, [tenant.id], undefined, 'planner'),
    auditor: await createTestAccount(db, [tenant.id], undefined, 'auditor'),
    tech: await createTestAccount(db, [tenant.id], undefined, 'technician'),
    reporter: await createTestAccount(db, [tenant.id], undefined, 'requester'),
  };
  await withTenant(db, tenant.id, (tx) =>
    tx.membership.updateMany({ where: { id: accounts.tech.memberships[0]! }, data: { licence: 'mobile' } }),
  );
  const logIn = async ({ email, password }: { email: string; password: string }) =>
    (await signIn(app, email, password)).agent;
  const [admin, planner, auditor, tech, reporter] = await Promise.all(Object.values(accounts).map(logIn));
  const site = (await admin!.post('/api/locations').send({ code: 'MAIN', name: 'Main site', kind: 'site' }).expect(201))
    .body;
  const annex = (await admin!.post('/api/locations').send({ code: 'ANNEX', name: 'Annex', kind: 'site' }).expect(201))
    .body;
  await admin!
    .put('/api/locations/access/' + accounts.tech.memberships[0])
    .send({ locationIds: [site.id, annex.id] })
    .expect(200);
  const asset = async (name: string, locationId = site.id) =>
    (await admin!.post('/api/assets').send({ name, locationId }).expect(201)).body as { id: string };
  const member = (name: keyof typeof accounts) => accounts[name].memberships[0]!;
  const body = (overrides: Record<string, unknown> = {}) => ({
    title: 'Pump service',
    criticality: 'optimal',
    discipline: 'Mechanical',
    frequency: { type: 'calendar', unit: 'month', interval: 1 },
    mode: 'fixed',
    startsOn: today,
    leadDays: 28,
    durationMinutes: 90,
    priority: 3,
    assets: [],
    ...overrides,
  });
  const schedule = async (agent: typeof admin, overrides: Record<string, unknown> = {}) =>
    (await agent!.post(schedules).send(body(overrides)).expect(201)).body as { id: string; number: string };
  const get = async <T>(agent: typeof admin, path: string) =>
    (await agent!.get('/api/ppm' + path).expect(200)).body as T;
  const ppmJobs = (scheduleId: string) =>
    withTenant(db, tenant.id, (tx) =>
      tx.workOrder.findMany({
        where: { type: 'ppm', ppmScheduleAsset: { scheduleId } },
        orderBy: [{ scheduledFor: 'asc' }, { title: 'asc' }],
      }),
    );
  return {
    tenant,
    cleanup,
    accounts,
    admin: admin!,
    planner: planner!,
    auditor: auditor!,
    tech: tech!,
    reporter: reporter!,
    site,
    annex,
    asset,
    member,
    schedule,
    get,
    ppmJobs,
  };
}

/** The visits a monthly fixed schedule anchored today makes for one asset in the 52 weeks from this Monday. */
function expectedWeeks(weeks = 52) {
  const end = addDays(monday, weeks * 7 - 1);
  const counts = new Array<number>(weeks).fill(0);
  for (let index = 0; index < 60; index += 1) {
    const date = occurrence(today, 'month', 1, index);
    if (date > end) break;
    if (date < monday) continue;
    counts[Math.floor(daysBetween(monday, date) / 7)]! += 1;
  }
  return counts;
}

const sum = (planner: PpmPlanner, key: 'scheduled' | 'due' | 'overdue' | 'completed') =>
  planner.totals.map((week) => week[key]);

it('lays schedules out against 52 weeks, and keeps the total as visits are raised, late and done', async () => {
  const { admin, planner, tech, cleanup, schedule, asset, member, get, ppmJobs } = await fixture();
  try {
    const pumps = [await asset('Pump 1'), await asset('Pump 2'), await asset('Pump 3')];
    const created = await schedule(admin, {
      title: 'Monthly pump check',
      criticality: 'statutory',
      assigneeId: member('tech'),
      estimatedCostMinor: 10_000,
      assets: pumps.map((pump) => ({ assetId: pump.id })),
    });

    // Every visit of the year, three pumps a month, in the week it falls in.
    const grid = await get<PpmPlanner>(planner, '/planner');
    expect(grid.today).toBe(today);
    expect(grid.weekStarts).toHaveLength(52);
    expect(grid.weekStarts[0]).toBe(monday);
    expect(grid.weekStarts[51]).toBe(addDays(monday, 51 * 7));
    const expected = expectedWeeks().map((count) => count * 3);
    expect(sum(grid, 'scheduled')).toEqual(expected);
    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0]).toMatchObject({
      number: 'PPM-0001',
      title: 'Monthly pump check',
      criticality: 'statutory',
      discipline: 'Mechanical',
      assets: 3,
      assigneeName: 'Test Person',
      frequency: { type: 'calendar', unit: 'month', interval: 1 },
    });
    expect(
      Object.fromEntries(Object.entries(grid.rows[0]!.weeks).map(([index, cell]) => [index, cell.scheduled])),
    ).toEqual(Object.fromEntries(expected.flatMap((count, index) => (count ? [[String(index), count]] : []))));

    // Visits within their lead time are raised and show as due, and the year's total does not change.
    await admin
      .post(schedules + '/' + created.id + '/generate')
      .send({})
      .expect(201);
    const raised = await get<PpmPlanner>(planner, '/planner');
    const total = (key: 'scheduled' | 'due') => sum(raised, key).reduce((a, b) => a + b, 0);
    expect(total('due')).toBeGreaterThan(0);
    expect(total('due') + total('scheduled')).toBe(expected.reduce((a, b) => a + b, 0));
    expect(raised.totals[0]!.due).toBe(3);

    // The numbers at the top: this week's visits and who has them, and nothing late or done yet.
    const first = await get<PpmSummary>(planner, '/summary');
    expect(first).toMatchObject({
      schedules: 1,
      overdue: 0,
      overdueStatutory: 0,
      disciplines: ['Mechanical'],
      compliance: { percent: null, onTime: 0, late: 0, overdue: 0 },
    });
    expect(first.dueThisWeek).toBe(expected[0]);
    expect(first.dueThisWeekUnassigned).toBe(0);

    // One visit is done on its day: on time. Another was due ten days ago and is done today: late. A third
    // was due twenty days ago and is not done: overdue.
    const [one, two, three] = await ppmJobs(created.id);
    const owner = ownerDb();
    try {
      await owner.workOrder.update({
        where: { id: two!.id },
        data: { scheduledFor: new Date(addDays(today, -10) + 'T00:00:00Z') },
      });
      await owner.workOrder.update({
        where: { id: three!.id },
        data: { scheduledFor: new Date(addDays(today, -20) + 'T00:00:00Z') },
      });
    } finally {
      await owner.$disconnect();
    }
    const move = async (id: string, status: string) => {
      const version = (await planner.get(jobs + '/' + id).expect(200)).body.version;
      return tech.post(jobs + '/' + id + '/status').send({ version, status });
    };
    for (const id of [one!.id, two!.id]) {
      expect((await move(id, 'on_site')).status).toBe(201);
      expect((await move(id, 'completed')).status).toBe(201);
    }
    const after = await get<PpmSummary>(planner, '/summary');
    expect(after).toMatchObject({
      overdue: 1,
      overdueStatutory: 1,
      compliance: { onTime: 1, late: 1, overdue: 1, percent: 33.3 },
      previousCompliance: { percent: null },
      byCriticality: [{ key: 'statutory', label: 'Statutory', onTime: 1, late: 1, overdue: 1, percent: 33.3 }],
      byDiscipline: [{ key: 'Mechanical', onTime: 1, late: 1, overdue: 1 }],
    });

    // The grid keeps what is late and not done in the first week, and counts what is done.
    const later = await get<PpmPlanner>(planner, '/planner');
    expect(later.totals[0]!.overdue).toBe(1);
    expect(later.totals[0]!.completed).toBe(1);
    expect(later.rows[0]!.weeks['0']!.overdue).toBe(1);

    // The overdue list names it, with how late.
    const overdue = await get<
      { jobId: string; daysLate: number; dueOn: string; criticality: string; asset: { name: string } | null }[]
    >(planner, '/overdue');
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toMatchObject({
      jobId: three!.id,
      daysLate: 20,
      dueOn: addDays(today, -20),
      criticality: 'statutory',
    });
    expect(overdue[0]!.asset?.name).toMatch(/^Pump [123]$/);

    // Months to come, with labour at 90 minutes a visit.
    const forecast = await get<PpmForecast>(planner, '/forecast?months=3');
    expect(forecast.months.map((month) => month.month)).toEqual(
      [0, 1, 2].map((n) => addMonths(today.slice(0, 8) + '01', n).slice(0, 7)),
    );
    for (const month of forecast.months) {
      expect(month.labourMinutes).toBe(month.visits * 90);
      // A planner can't see costs, so none is shown to them, nor whether there is an estimate.
      expect(month.costMinor).toBeNull();
      expect(month.uncosted).toBe(0);
    }
    const costed = await get<PpmForecast>(admin, '/forecast?months=3');
    expect(costed.currency).toBe('GBP');
    expect(costed.months.map((month) => month.visits)).toEqual(forecast.months.map((month) => month.visits));
    for (const month of costed.months) {
      expect(month.costMinor).toBe(month.visits * 10_000);
      expect(month.uncosted).toBe(0);
    }
    expect(forecast.months.reduce((visits, month) => visits + month.visits, 0)).toBeGreaterThan(0);
  } finally {
    await cleanup();
  }
});

it('filters the planner, keeps meter schedules out of the calendar, and checks what it is asked for', async () => {
  const { admin, planner, cleanup, schedule, asset, get } = await fixture();
  try {
    const pump = await asset('Pump 1');
    await schedule(admin, { title: 'Pump check', criticality: 'statutory', assets: [{ assetId: pump.id }] });
    await schedule(admin, {
      title: 'Fan check',
      criticality: 'optimal',
      discipline: 'HVAC',
      frequency: { type: 'calendar', unit: 'week', interval: 2 },
      assets: [{ assetId: pump.id }],
    });
    const rows = async (query = '') =>
      (await get<PpmPlanner>(planner, '/planner' + query)).rows.map((row) => row.title);
    expect(await rows()).toEqual(['Pump check', 'Fan check']);
    expect(await rows('?criticality=statutory')).toEqual(['Pump check']);
    expect(await rows('?discipline=HVAC')).toEqual(['Fan check']);
    expect(await rows('?q=fan')).toEqual(['Fan check']);
    expect(await rows('?q=ppm-0002')).toEqual(['Fan check']);

    // A different window, and a shorter one.
    const next = addDays(monday, 14);
    const window = await get<PpmPlanner>(planner, `/planner?from=${next}&weeks=8`);
    expect(window.weekStarts).toEqual(Array.from({ length: 8 }, (_, index) => addDays(next, index * 7)));
    expect(window.totals).toHaveLength(8);
    // Visits that fall before a window that starts in the future are not squeezed into its first week.
    const fan = window.rows.find((row) => row.title === 'Fan check')!;
    const inWindow = Object.values(fan.weeks).reduce((count, week) => count + week.scheduled, 0);
    expect(inWindow).toBeGreaterThan(0);
    expect(fan.weeks[0]?.scheduled ?? 0).toBeLessThanOrEqual(1);
    // A date in the middle of a week starts the grid on that week's Monday.
    expect((await get<PpmPlanner>(planner, `/planner?from=${addDays(monday, 3)}&weeks=1`)).weekStarts).toEqual([
      monday,
    ]);
    for (const bad of ['?weeks=0', '?weeks=105', '?from=tomorrow', '?colour=red', '?criticality=vital']) {
      await planner.get('/api/ppm/planner' + bad).expect(400);
    }
    await planner.get('/api/ppm/forecast?months=0').expect(400);
    await planner.get('/api/ppm/forecast?months=37').expect(400);
  } finally {
    await cleanup();
  }
});

it('gives the screens’ numbers only to people who may read planned maintenance, and only for their sites', async () => {
  const { admin, planner, auditor, tech, reporter, cleanup, tenant, accounts, annex, schedule, asset, get } =
    await fixture();
  const stranger = await fixture();
  try {
    const [mainPump, annexPump] = [await asset('Main pump'), await asset('Annex pump', annex.id)];
    await schedule(admin, { title: 'Main service', assets: [{ assetId: mainPump.id }] });
    await schedule(admin, { title: 'Annex service', assets: [{ assetId: annexPump.id }] });
    await stranger.schedule(stranger.admin, {
      title: 'Their service',
      assets: [{ assetId: (await stranger.asset('Their pump')).id }],
    });

    // Technicians and requesters have no planned maintenance, and the people list is for those who plan it.
    for (const path of ['/summary', '/planner', '/forecast', '/overdue', '/assignees']) {
      await tech.get('/api/ppm' + path).expect(403);
      await reporter.get('/api/ppm' + path).expect(403);
    }
    await auditor.get('/api/ppm/assignees').expect(403);
    const assignees = await get<{ id: string; name: string; role: string }[]>(planner, '/assignees');
    const ids = assignees.map((person) => person.id);
    expect(ids).toContain(accounts.tech.memberships[0]);
    expect(ids).toContain(accounts.planner.memberships[0]);
    expect(ids).not.toContain(accounts.reporter.memberships[0]);
    expect(ids).not.toContain(accounts.auditor.memberships[0]);
    expect(assignees.find((person) => person.id === accounts.tech.memberships[0])).toMatchObject({
      role: 'Technician',
    });

    // Everything for the estate, then only the annex for someone limited to it, and nothing from another organisation.
    expect((await get<PpmPlanner>(auditor, '/planner')).rows.map((row) => row.title)).toEqual([
      'Main service',
      'Annex service',
    ]);
    expect((await get<PpmSummary>(auditor, '/summary')).schedules).toBe(2);
    await withTenant(db, tenant.id, async (tx) => {
      await tx.membership.updateMany({
        where: { id: accounts.auditor.memberships[0]! },
        data: { locationScoped: true },
      });
      await tx.membershipSite.create({
        data: { tenantId: tenant.id, membershipId: accounts.auditor.memberships[0]!, locationId: annex.id },
      });
    });
    const scoped = await get<PpmPlanner>(auditor, '/planner');
    expect(scoped.rows.map((row) => [row.title, row.assets])).toEqual([['Annex service', 1]]);
    expect((await get<PpmSummary>(auditor, '/summary')).schedules).toBe(1);
    expect(sum(scoped, 'scheduled').reduce((a, b) => a + b, 0)).toBe(expectedWeeks().reduce((a, b) => a + b, 0));
    // This month's visit on the annex only: the main site's is not counted for someone who can't see it.
    expect((await get<PpmForecast>(auditor, '/forecast?months=1')).months[0]!.visits).toBe(1);
    expect(await get<unknown[]>(auditor, '/overdue')).toEqual([]);
    expect((await get<PpmPlanner>(stranger.planner, '/planner')).rows.map((row) => row.title)).toEqual([
      'Their service',
    ]);
  } finally {
    await stranger.cleanup();
    await cleanup();
  }
});
