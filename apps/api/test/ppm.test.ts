import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, withTenant } from '@fmstead/db';
import { addDays, addInterval, endOfLocalDay, firstOccurrenceOnOrAfter, localDate } from '@fmstead/shared';
import { createTestAccount, createTestTenant, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const templates = '/api/ppm/templates';
const schedules = '/api/ppm/schedules';
const jobs = '/api/work-orders';
const today = localDate(new Date(), 'Europe/London');

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
    (await admin!.post('/api/assets').send({ name, locationId }).expect(201)).body as { id: string; name: string };
  const member = (name: keyof typeof accounts) => accounts[name].memberships[0]!;
  const template = async (overrides: Record<string, unknown> = {}) =>
    (
      await planner!
        .post(templates)
        .send({
          name: 'Pump service ' + randomUUID().slice(0, 6),
          description: 'Service the pump and record its readings.',
          discipline: 'Mechanical',
          criticality: 'statutory',
          durationMinutes: 90,
          skills: 'Pump fitter',
          safetyNotes: 'Isolate the pump first.',
          steps: [
            { label: 'Isolate the pump', kind: 'tick', required: true },
            { label: 'Discharge pressure', kind: 'number', required: true, unit: 'bar' },
            { label: 'Notes', kind: 'text', required: false },
          ],
          ...overrides,
        })
        .expect(201)
    ).body as { id: string; name: string; version: number };
  const body = (overrides: Record<string, unknown> = {}) => ({
    title: 'Pump annual service',
    criticality: 'statutory',
    frequency: { type: 'calendar', unit: 'month', interval: 12 },
    mode: 'fixed',
    startsOn: addDays(today, 10),
    leadDays: 28,
    durationMinutes: 90,
    priority: 2,
    ...overrides,
  });
  const schedule = async (overrides: Record<string, unknown> = {}) =>
    (
      await planner!
        .post(schedules)
        .send({ assets: [], ...body(overrides) })
        .expect(201)
    ).body as ScheduleBody;
  const ppmJobs = (scheduleId?: string) =>
    withTenant(db, tenant.id, (tx) =>
      tx.workOrder.findMany({
        where: { type: 'ppm', ...(scheduleId ? { ppmScheduleAsset: { scheduleId } } : {}) },
        include: { checklists: { include: { items: { orderBy: { position: 'asc' } } } }, entries: true },
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
    template,
    body,
    schedule,
    ppmJobs,
  };
}

type ScheduleBody = {
  id: string;
  number: string;
  version: number;
  nextDueOn: string | null;
  assets: number;
  rows: {
    id: string;
    asset: { id: string; name: string };
    nextDueOn: string | null;
    nextDueTotal: string | null;
    lastDoneOn: string | null;
    state: string | null;
    openJob: { id: string; status: string; scheduledFor: string } | null;
  }[];
};

it('keeps a library of maintenance tasks that only planners change, and retires one only when nothing uses it', async () => {
  const { planner, auditor, tech, reporter, cleanup, template, schedule, asset, body } = await fixture();
  const stranger = await fixture();
  try {
    const first = await template({ name: 'Pump service' });
    expect(first).toMatchObject({
      name: 'Pump service',
      criticality: 'statutory',
      durationMinutes: 90,
      version: 1,
      schedules: 0,
      steps: [
        { label: 'Isolate the pump', kind: 'tick', required: true },
        { label: 'Discharge pressure', kind: 'number', required: true, unit: 'bar' },
        { label: 'Notes', kind: 'text', required: false },
      ],
    });
    // The library is for people who plan maintenance, and read-only roles can look at it.
    await tech.get(templates).expect(403);
    await reporter.get(templates).expect(403);
    expect((await auditor.get(templates).expect(200)).body.map(({ name }: { name: string }) => name)).toEqual([
      'Pump service',
    ]);
    await auditor.post(templates).send({ name: 'No', durationMinutes: 30, steps: [] }).expect(403);
    await tech.post(templates).send({ name: 'No', durationMinutes: 30, steps: [] }).expect(403);

    // Names are unique, and what is sent is checked.
    await planner.post(templates).send({ name: 'Pump service', durationMinutes: 30, steps: [] }).expect(409);
    const valid = { name: 'Fire alarm test', durationMinutes: 60, steps: [] };
    await planner
      .post(templates)
      .send({ ...valid, durationMinutes: 1 })
      .expect(400);
    await planner
      .post(templates)
      .send({ ...valid, criticality: 'vital' })
      .expect(400);
    await planner
      .post(templates)
      .send({ ...valid, owner: 'me' })
      .expect(400);
    await planner
      .post(templates)
      .send({ ...valid, steps: Array.from({ length: 51 }, (_, i) => ({ label: 'Step ' + i, kind: 'tick' })) })
      .expect(400);
    await planner
      .post(templates)
      .send({ ...valid, steps: [{ label: 'Tick', kind: 'tick', unit: 'bar' }] })
      .expect(400);

    // Editing needs the version it was read at, and keeps names unique.
    const url = templates + '/' + first.id;
    const edit = { ...valid, name: 'Pump service (annual)', durationMinutes: 120, steps: [] };
    await planner
      .put(url)
      .send({ ...edit, version: 7 })
      .expect(409);
    const renamed = (
      await planner
        .put(url)
        .send({ ...edit, version: 1 })
        .expect(200)
    ).body;
    expect(renamed).toMatchObject({ name: 'Pump service (annual)', durationMinutes: 120, version: 2 });
    const other = await template({ name: 'Boiler service' });
    await planner
      .put(templates + '/' + other.id)
      .send({ ...edit, version: 1 })
      .expect(409);
    await auditor
      .put(url)
      .send({ ...edit, version: 2 })
      .expect(403);

    // A task an active schedule uses can't be retired. Archiving the schedule lets it go, and frees its name.
    const used = await schedule({ templateId: first.id, assets: [{ assetId: (await asset('Pump 1')).id }] });
    expect(
      (await planner.get(templates).expect(200)).body.find(({ id }: { id: string }) => id === first.id).schedules,
    ).toBe(1);
    const blocked = await planner.delete(url).expect(422);
    expect(blocked.body.message).toContain('1 active schedule uses this task');
    await auditor.delete(url).expect(403);
    const record = (await planner.get(schedules + '/' + used.id).expect(200)).body;
    await planner
      .put(schedules + '/' + used.id)
      .send({ ...body({ templateId: first.id, active: false }), version: record.version })
      .expect(200);
    await planner.delete(url).expect(200);
    expect((await planner.get(templates).expect(200)).body.map(({ name }: { name: string }) => name)).toEqual([
      'Boiler service',
    ]);
    expect((await planner.get(templates + '?retired=1').expect(200)).body).toHaveLength(2);
    await planner
      .post(templates)
      .send({ ...valid, name: 'Pump service (annual)' })
      .expect(201);
    await planner
      .put(url)
      .send({ ...edit, version: 3 })
      .expect(404);

    // Another organisation's planner can neither see nor change it.
    await stranger.planner
      .put(templates + '/' + other.id)
      .send({ ...edit, version: 1 })
      .expect(404);
    await stranger.planner.delete(templates + '/' + other.id).expect(404);
    expect(
      await stranger.planner
        .get(templates)
        .expect(200)
        .then((res) => res.body),
    ).toEqual([]);
  } finally {
    await stranger.cleanup();
    await cleanup();
  }
});

it('plans schedules for calendar and meter visits, works each asset’s first visit out, and checks what it is given', async () => {
  const {
    tenant,
    planner,
    auditor,
    tech,
    reporter,
    cleanup,
    template,
    schedule,
    asset,
    annex,
    member,
    body,
    accounts,
  } = await fixture();
  const stranger = await fixture();
  try {
    const task = await template();
    const [pump1, pump2] = [await asset('Pump 1'), await asset('Pump 2')];
    const outside = await stranger.asset('Their pump');

    // Who may plan, and what is refused.
    await tech.post(schedules).send(body()).expect(403);
    await reporter.post(schedules).send(body()).expect(403);
    await auditor.post(schedules).send(body()).expect(403);
    const refuse = async (overrides: Record<string, unknown>, status: number) =>
      planner
        .post(schedules)
        .send({ assets: [], ...body(overrides) })
        .expect(status);
    await refuse({ frequency: { type: 'meter', meterName: 'Run hours', interval: '250' }, mode: 'fixed' }, 400);
    await refuse({ startsOn: '2026-02-31' }, 400);
    await refuse({ frequency: { type: 'calendar', unit: 'month', interval: 0 } }, 400);
    await refuse({ frequency: { type: 'calendar', unit: 'fortnight', interval: 1 } }, 400);
    await refuse({ frequency: { type: 'meter', meterName: 'Run hours', interval: '0' }, mode: 'floating' }, 400);
    await refuse({ leadDays: 366 }, 400);
    await refuse({ priority: 5 }, 400);
    await refuse({ estimatedCostMinor: -1 }, 400);
    await refuse({ templateId: randomUUID() }, 422);
    await refuse({ assigneeId: member('reporter') }, 422);
    await refuse({ assigneeId: randomUUID() }, 422);
    await refuse({ assets: [{ assetId: outside.id }] }, 404);
    await refuse({ assets: [{ assetId: pump1.id }, { assetId: pump1.id }] }, 422);
    const meterless = await planner
      .post(schedules)
      .send(
        body({
          frequency: { type: 'meter', meterName: 'Run hours', interval: '250' },
          mode: 'floating',
          assets: [{ assetId: pump1.id }],
        }),
      )
      .expect(422);
    expect(meterless.body.message).toContain('Pump 1 has no meter called Run hours');

    // A fixed schedule starting ahead begins on its first date, and takes the next number.
    const ahead = await schedule({
      title: 'Pump annual service',
      templateId: task.id,
      assigneeId: member('tech'),
      estimatedCostMinor: 24300,
      assets: [{ assetId: pump1.id }, { assetId: pump2.id }],
    });
    expect(ahead).toMatchObject({ number: 'PPM-0001', assets: 2, nextDueOn: addDays(today, 10) });
    expect(ahead.rows.map((row) => row.nextDueOn)).toEqual([addDays(today, 10), addDays(today, 10)]);
    expect(ahead.rows.map((row) => row.state)).toEqual(['scheduled', 'scheduled']);

    // One that began in the past keeps its anchor's dates and does not raise a backlog.
    const anchor = addDays(today, -400);
    const past = await schedule({
      title: 'Quarterly check',
      frequency: { type: 'calendar', unit: 'month', interval: 3 },
      startsOn: anchor,
      assets: [{ assetId: pump1.id }],
    });
    expect(past.number).toBe('PPM-0002');
    expect(past.rows[0]!.nextDueOn).toBe(firstOccurrenceOnOrAfter(anchor, 'month', 3, today));
    expect(past.rows[0]!.nextDueOn! >= today).toBe(true);

    // A floating schedule is due a set time after the last visit, or on its first date if there was none.
    const lastDone = addDays(today, -30);
    const floating = await schedule({
      title: 'Floating service',
      frequency: { type: 'calendar', unit: 'month', interval: 3 },
      mode: 'floating',
      assets: [{ assetId: pump1.id, lastDoneOn: lastDone }, { assetId: pump2.id }],
    });
    expect(floating.rows.map(({ asset: a, nextDueOn, lastDoneOn }) => [a.name, nextDueOn, lastDoneOn])).toEqual([
      ['Pump 1', addInterval(lastDone, 'month', 3), lastDone],
      ['Pump 2', addDays(today, 10), null],
    ]);

    // The list, with its filters.
    const list = async (query = '') => (await planner.get(schedules + query).expect(200)).body;
    expect((await list()).total).toBe(3);
    expect((await list('?q=quarterly')).items.map(({ title }: { title: string }) => title)).toEqual([
      'Quarterly check',
    ]);
    expect((await list('?q=ppm-0001')).items).toHaveLength(1);
    expect((await list('?criticality=statutory')).items.map(({ number }: { number: string }) => number)).toEqual([
      'PPM-0001',
      'PPM-0002',
      'PPM-0003',
    ]);
    expect((await list('?status=archived')).items).toEqual([]);
    expect((await list()).items[0]).toMatchObject({
      number: 'PPM-0001',
      frequency: { type: 'calendar', unit: 'month', interval: 12 },
      mode: 'fixed',
      assets: 2,
      nextDueOn: addDays(today, 10),
      overdue: 0,
      assigneeName: 'Test Person',
    });
    // Sorting by title, either way, and unknown columns are refused.
    const titles = async (query: string) =>
      (await list(query)).items.map(({ title }: { title: string }) => title) as string[];
    const ascending = await titles('?sort=title&dir=asc');
    expect(ascending).toHaveLength(3);
    expect(await titles('?sort=title&dir=desc')).toEqual([...ascending].reverse());
    await planner.get(schedules + '?sort=password').expect(400);
    await planner.get(schedules + '?limit=0').expect(400);
    await planner.get(schedules + '?colour=red').expect(400);
    await auditor.get(schedules).expect(200);
    await tech.get(schedules).expect(403);
    await reporter.get(schedules).expect(403);

    // Editing needs the current version. Changing only the words leaves the dates alone; changing the timing works
    // each asset's next visit out again, and the audit log says so.
    const url = schedules + '/' + ahead.id;
    await planner
      .put(url)
      .send({ ...body({ templateId: task.id }), version: 9 })
      .expect(409);
    await auditor
      .put(url)
      .send({ ...body({ templateId: task.id }), version: 1 })
      .expect(403);
    const retitled = (
      await planner
        .put(url)
        .send({
          ...body({ templateId: task.id, title: 'Pump service (annual)', assigneeId: member('tech') }),
          version: 1,
        })
        .expect(200)
    ).body;
    expect(retitled).toMatchObject({ title: 'Pump service (annual)', version: 2 });
    expect(retitled.rows.map((row: { nextDueOn: string }) => row.nextDueOn)).toEqual([
      addDays(today, 10),
      addDays(today, 10),
    ]);
    // A visit that is overdue and not yet raised is kept by an edit that doesn't touch the timing.
    const overdue = new Date(addDays(today, -3) + 'T00:00:00Z');
    await withTenant(db, tenant.id, (tx) =>
      tx.ppmScheduleAsset.updateMany({ where: { scheduleId: ahead.id }, data: { nextDueOn: overdue } }),
    );
    const reworded = (
      await planner
        .put(url)
        .send({
          ...body({ templateId: task.id, title: 'Pump service (annual) ', assigneeId: member('tech') }),
          version: 2,
        })
        .expect(200)
    ).body as ScheduleBody;
    expect(reworded.rows.map((row) => row.nextDueOn)).toEqual([addDays(today, -3), addDays(today, -3)]);
    expect(reworded.version).toBe(3);
    await withTenant(db, tenant.id, (tx) =>
      tx.ppmScheduleAsset.updateMany({
        where: { scheduleId: ahead.id },
        data: { nextDueOn: new Date(addDays(today, 10) + 'T00:00:00Z') },
      }),
    );
    const retimed = (
      await planner
        .put(url)
        .send({
          ...body({
            templateId: task.id,
            startsOn: addDays(today, 40),
            frequency: { type: 'calendar', unit: 'month', interval: 6 },
          }),
          version: 3,
        })
        .expect(200)
    ).body;
    expect(retimed.rows.map((row: { nextDueOn: string }) => row.nextDueOn)).toEqual([
      addDays(today, 40),
      addDays(today, 40),
    ]);
    await planner
      .put(url)
      .send({ ...body({ templateId: randomUUID() }), version: 4 })
      .expect(422);

    // Assets can be added and taken off. One never visited is deleted; asking for the same set again changes nothing.
    const pump3 = await asset('Pump 3');
    const swapped = (
      await planner
        .put(url + '/assets')
        .send({ version: 4, assets: [{ assetId: pump2.id }, { assetId: pump3.id }] })
        .expect(200)
    ).body;
    expect(swapped.rows.map((row: { asset: { name: string } }) => row.asset.name)).toEqual(['Pump 2', 'Pump 3']);
    expect(swapped.version).toBe(5);
    await planner
      .put(url + '/assets')
      .send({ version: 3, assets: [] })
      .expect(409);
    await auditor
      .put(url + '/assets')
      .send({ version: 5, assets: [] })
      .expect(403);
    await planner
      .put(url + '/assets')
      .send({ version: 5, assets: [{ assetId: outside.id }] })
      .expect(404);
    expect(
      await withTenant(db, tenant.id, (tx) => tx.ppmScheduleAsset.count({ where: { scheduleId: ahead.id } })),
    ).toBe(2);

    // Someone limited to the annex sees only the schedules with an asset there, and only that asset in them.
    const annexPump = await asset('Annex pump', annex.id);
    const annexSchedule = await schedule({ title: 'Annex pump service', assets: [{ assetId: annexPump.id }] });
    await withTenant(db, tenant.id, async (tx) => {
      await tx.membership.updateMany({
        where: { id: accounts.auditor.memberships[0]! },
        data: { locationScoped: true },
      });
      await tx.membershipSite.create({
        data: { tenantId: tenant.id, membershipId: accounts.auditor.memberships[0]!, locationId: annex.id },
      });
    });
    const scoped = (await auditor.get(schedules).expect(200)).body;
    expect(scoped.items.map(({ title }: { title: string }) => title)).toEqual(['Annex pump service']);
    await auditor.get(schedules + '/' + annexSchedule.id).expect(200);
    await auditor.get(schedules + '/' + ahead.id).expect(404);

    // Another organisation sees none of it.
    await stranger.planner.get(schedules + '/' + ahead.id).expect(404);
    await stranger.planner
      .put(url)
      .send({ ...body(), version: 4 })
      .expect(404);
    await stranger.planner
      .put(url + '/assets')
      .send({ version: 4, assets: [] })
      .expect(404);
    await stranger.planner
      .post(url + '/generate')
      .send({})
      .expect(404);
    expect((await stranger.planner.get(schedules).expect(200)).body.total).toBe(0);
  } finally {
    await stranger.cleanup();
    await cleanup();
  }
});

it('raises each visit once, ahead of its due date, with the task’s checklist, and moves the schedule on', async () => {
  const { planner, tech, tenant, cleanup, template, schedule, asset, member, ppmJobs, body } = await fixture();
  try {
    const task = await template({ name: 'Pump service' });
    const [pump1, pump2] = [await asset('Pump 1'), await asset('Pump 2')];
    const created = await schedule({
      templateId: task.id,
      assigneeId: member('tech'),
      assets: [{ assetId: pump1.id }, { assetId: pump2.id }],
    });
    const url = schedules + '/' + created.id;
    const due = addDays(today, 10);

    // Raised now, because the visit is inside its 28 days' notice, and not again.
    expect(
      (
        await planner
          .post(url + '/generate')
          .send({})
          .expect(201)
      ).body,
    ).toEqual({ created: 2, skipped: 0 });
    const raised = await ppmJobs(created.id);
    expect(raised.map((job) => job.title)).toEqual(['Pump annual service · Pump 1', 'Pump annual service · Pump 2']);
    expect(raised[0]).toMatchObject({
      type: 'ppm',
      status: 'assigned',
      assigneeId: member('tech'),
      priority: 2,
      impact: 3,
      urgency: 3,
      scheduledFor: new Date(due + 'T00:00:00Z'),
      responseDueAt: null,
      attendDueAt: null,
    });
    expect(raised[0]!.number).toMatch(/^WO-\d{5}$/);
    expect(raised[0]!.fixDueAt).toEqual(endOfLocalDay(due, 'Europe/London'));
    expect(raised[0]!.description).toContain('Service the pump and record its readings.');
    expect(raised[0]!.description).toContain('Safety: Isolate the pump first.');
    // The task's steps are copied on as a checklist that holds back completing the job.
    expect(raised[0]!.checklists).toHaveLength(1);
    expect(raised[0]!.checklists[0]).toMatchObject({ title: 'Pump service', gate: 'completion' });
    expect(raised[0]!.checklists[0]!.items.map((item) => [item.label, item.kind, item.required, item.unit])).toEqual([
      ['Isolate the pump', 'tick', true, null],
      ['Discharge pressure', 'number', true, 'bar'],
      ['Notes', 'text', false, null],
    ]);
    expect(raised[0]!.entries.map((entry) => entry.body)).toEqual([`Raised from PPM-0001, due ${due}`]);
    expect(
      (
        await planner
          .post(url + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(0);
    expect(await ppmJobs(created.id)).toHaveLength(2);
    // The schedule has moved on to next year's visit.
    const record = (await planner.get(url).expect(200)).body as ScheduleBody;
    expect(record.rows.map((row) => row.nextDueOn)).toEqual([addInterval(due, 'year', 1), addInterval(due, 'year', 1)]);
    expect(record.rows.map((row) => [row.state, row.openJob?.scheduledFor])).toEqual([
      ['due', due],
      ['due', due],
    ]);
    const audited = await withTenant(db, tenant.id, (tx) =>
      tx.auditEvent.count({ where: { action: { in: ['ppm.generate', 'ppm_schedule.generate'] } } }),
    );
    // One event for each job raised, and one for each run asked for.
    expect(audited).toBe(4);

    // The job is an ordinary job: it shows in the list and the technician does it. Completing waits for the checklist.
    const job = raised[0]!;
    // The job says where it came from.
    expect((await planner.get(jobs + '/' + job.id).expect(200)).body).toMatchObject({
      type: 'ppm',
      ppm: { scheduleNumber: 'PPM-0001', dueOn: due },
    });
    const items = job.checklists[0]!.items;
    const listed = (await planner.get(jobs + '?view=all&q=' + encodeURIComponent('Pump 1')).expect(200)).body.items;
    expect(listed.map(({ id }: { id: string }) => id)).toContain(job.id);
    const move = async (status: string) => {
      const version = (await planner.get(jobs + '/' + job.id).expect(200)).body.version;
      return tech.post(jobs + '/' + job.id + '/status').send({ version, status });
    };
    expect((await move('on_site')).status).toBe(201);
    const early = await move('completed');
    expect(early.status).toBe(422);
    expect(early.body.code).toBe('checklist_incomplete');
    const answer = (index: number, value: string) =>
      tech
        .put(`${jobs}/${job.id}/checklists/${job.checklists[0]!.id}/items/${items[index]!.id}`)
        .send({ answer: value });
    await answer(0, 'done').expect(200);
    await answer(1, '3.2').expect(200);
    expect((await move('completed')).status).toBe(201);
    // Done: a fixed schedule keeps its dates, and remembers when the visit was made.
    const afterDone = (await planner.get(url).expect(200)).body as ScheduleBody;
    expect(afterDone.rows[0]).toMatchObject({
      lastDoneOn: today,
      nextDueOn: addInterval(due, 'year', 1),
      state: 'scheduled',
    });
    expect(afterDone.rows[1]).toMatchObject({ lastDoneOn: null, state: 'due' });

    // Not yet due: far enough ahead that no job is raised, and the whole organisation can be run at once.
    const later = await schedule({ title: 'Far off', startsOn: addDays(today, 60), assets: [{ assetId: pump1.id }] });
    expect(
      (
        await planner
          .post(schedules + '/' + later.id + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(0);
    expect((await planner.post('/api/ppm/generate').send({}).expect(201)).body.created).toBe(0);
    await tech.post('/api/ppm/generate').send({}).expect(403);
    await tech
      .post(url + '/generate')
      .send({})
      .expect(403);

    // Two runs at once raise each visit once.
    const crowd = await schedule({
      title: 'Crowd',
      startsOn: addDays(today, 5),
      assets: [{ assetId: pump1.id }, { assetId: pump2.id }, { assetId: (await asset('Pump 3')).id }],
    });
    const results = await Promise.all([
      planner.post(schedules + '/' + crowd.id + '/generate').send({}),
      planner.post(schedules + '/' + crowd.id + '/generate').send({}),
    ]);
    expect(results.map((res) => res.status)).toEqual([201, 201]);
    expect(results.reduce((total, res) => total + (res.body as { created: number }).created, 0)).toBe(3);
    expect(await ppmJobs(crowd.id)).toHaveLength(3);

    // An archived schedule raises nothing. Put back to work it starts from today, and does not raise what it missed.
    await withTenant(db, tenant.id, (tx) =>
      tx.ppmScheduleAsset.updateMany({
        where: { scheduleId: crowd.id },
        data: { nextDueOn: new Date(addDays(today, -90) + 'T00:00:00Z') },
      }),
    );
    const record2 = (await planner.get(schedules + '/' + crowd.id).expect(200)).body;
    await planner
      .put(schedules + '/' + crowd.id)
      .send({ ...body({ title: 'Crowd', startsOn: addDays(today, 5), active: false }), version: record2.version })
      .expect(200);
    expect(
      (
        await planner
          .post(schedules + '/' + crowd.id + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(0);
    const archived = (await planner.get(schedules + '/' + crowd.id).expect(200)).body;
    const back = (
      await planner
        .put(schedules + '/' + crowd.id)
        .send({ ...body({ title: 'Crowd', startsOn: addDays(today, 5), active: true }), version: archived.version })
        .expect(200)
    ).body as ScheduleBody;
    // Its stale dates are worked out afresh from today.
    expect(back.rows.map((row) => row.nextDueOn)).toEqual(Array(3).fill(addDays(today, 5)));
    await planner
      .post(schedules + '/' + crowd.id + '/generate')
      .send({})
      .expect(201);
    expect(await ppmJobs(crowd.id)).toHaveLength(3);
  } finally {
    await cleanup();
  }
});

it('counts a floating visit on from when it is done or dropped, and a meter visit from the meter', async () => {
  const { admin, planner, tech, cleanup, schedule, asset, member, ppmJobs } = await fixture();
  try {
    const [pump1, pump2] = [await asset('Pump 1'), await asset('Pump 2')];
    const floating = await schedule({
      title: 'Floating service',
      frequency: { type: 'calendar', unit: 'month', interval: 3 },
      mode: 'floating',
      startsOn: addDays(today, 5),
      assigneeId: member('tech'),
      assets: [{ assetId: pump1.id }, { assetId: pump2.id }],
    });
    const url = schedules + '/' + floating.id;
    expect(
      (
        await planner
          .post(url + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(2);
    // Each asset now waits for its visit to be done, so there is no next date and nothing more is raised.
    const waiting = (await planner.get(url).expect(200)).body as ScheduleBody;
    expect(waiting.rows.map((row) => row.nextDueOn)).toEqual([null, null]);
    expect(
      (
        await planner
          .post(url + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(0);
    const [one, two] = await ppmJobs(floating.id);
    const move = async (agent: typeof tech, id: string, status: string) => {
      const version = (await planner.get(jobs + '/' + id).expect(200)).body.version;
      return agent.post(jobs + '/' + id + '/status').send({ version, status });
    };
    // Doing one counts the next visit on from today; dropping the other counts it on from its due date.
    expect((await move(tech, one!.id, 'on_site')).status).toBe(201);
    expect((await move(tech, one!.id, 'completed')).status).toBe(201);
    expect((await move(planner, two!.id, 'cancelled')).status).toBe(201);
    const moved = (await planner.get(url).expect(200)).body as ScheduleBody;
    const byAsset = Object.fromEntries(moved.rows.map((row) => [row.asset.name, row]));
    expect(byAsset['Pump 1']).toMatchObject({ lastDoneOn: today, nextDueOn: addInterval(today, 'month', 3) });
    expect(byAsset['Pump 2']).toMatchObject({
      lastDoneOn: null,
      nextDueOn: addInterval(addDays(today, 5), 'month', 3),
    });

    // A meter schedule is due every so many hours on the asset's own meter.
    const meter = (
      await admin
        .post(`/api/assets/${pump1.id}/operations/meters`)
        .send({ name: 'Run hours', unit: 'h', rolloverAt: null })
        .expect(201)
    ).body;
    const reading = (value: string, at: string) =>
      admin
        .post(`/api/assets/${pump1.id}/operations/meters/${meter.id}/readings`)
        .send({ value, recordedAt: at, submission: randomUUID(), rolledOver: false });
    await reading('50', new Date(Date.now() - 3_600_000).toISOString()).expect(201);
    const hours = await schedule({
      title: 'Every 100 hours',
      frequency: { type: 'meter', meterName: 'Run hours', interval: '100' },
      mode: 'floating',
      assigneeId: member('tech'),
      assets: [{ assetId: pump1.id }],
    });
    const hoursUrl = schedules + '/' + hours.id;
    // The first visit is due a full interval on from where the meter stands now.
    const started = (await planner.get(hoursUrl).expect(200)).body as ScheduleBody & { frequency: unknown };
    expect(started.rows[0]).toMatchObject({ nextDueTotal: '150', currentTotal: '50', nextDueOn: null });
    expect(
      (
        await planner
          .post(hoursUrl + '/generate')
          .send({})
          .expect(201)
      ).body,
    ).toEqual({ created: 0, skipped: 1 });
    await reading('149', new Date(Date.now() - 1_800_000).toISOString()).expect(201);
    expect(
      (
        await planner
          .post(hoursUrl + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(0);
    await reading('160', new Date().toISOString()).expect(201);
    expect(
      (
        await planner
          .post(hoursUrl + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(1);
    expect(
      (
        await planner
          .post(hoursUrl + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(0);
    const [visit] = await ppmJobs(hours.id);
    expect(visit).toMatchObject({ title: 'Every 100 hours · Pump 1', scheduledFor: new Date(today + 'T00:00:00Z') });
    expect((await move(tech, visit!.id, 'on_site')).status).toBe(201);
    expect((await move(tech, visit!.id, 'completed')).status).toBe(201);
    // Done at 160 hours, the next visit is due at 260.
    expect(((await planner.get(hoursUrl).expect(200)).body as ScheduleBody).rows[0]).toMatchObject({
      nextDueTotal: '260',
      lastDoneOn: today,
    });

    // The meter crosses the next interval the same day the last visit was done: the new visit is not lost.
    await new Promise((resolve) => setTimeout(resolve, 25));
    await reading('261', new Date().toISOString()).expect(201);
    expect(
      (
        await planner
          .post(hoursUrl + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(1);
    const sameDay = (await ppmJobs(hours.id)).map((job) => job.scheduledFor!.toISOString().slice(0, 10));
    expect(sameDay).toEqual([today, addDays(today, 1)]);
    const pending = (await planner.get(hoursUrl).expect(200)).body as ScheduleBody;
    expect(pending.rows[0]).toMatchObject({ nextDueTotal: null, state: 'due' });
    const second = (await ppmJobs(hours.id))[1]!;
    expect((await move(tech, second.id, 'on_site')).status).toBe(201);
    expect((await move(tech, second.id, 'completed')).status).toBe(201);
    expect(((await planner.get(hoursUrl).expect(200)).body as ScheduleBody).rows[0]).toMatchObject({
      nextDueTotal: '361',
    });

    // A long lead on a short interval raises a bounded number in one run, and the rest on the runs after.
    const daily = await schedule({
      title: 'Daily check',
      frequency: { type: 'calendar', unit: 'day', interval: 1 },
      startsOn: today,
      assets: [{ assetId: pump2.id }],
    });
    const dailyUrl = schedules + '/' + daily.id;
    expect(
      (
        await planner
          .post(dailyUrl + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(12);
    expect(
      (
        await planner
          .post(dailyUrl + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(12);
    expect(
      (
        await planner
          .post(dailyUrl + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(5);
    expect(
      (
        await planner
          .post(dailyUrl + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(0);
    const dates = (await ppmJobs(daily.id)).map((job) => job.scheduledFor!.toISOString().slice(0, 10));
    expect(dates).toHaveLength(29);
    expect(new Set(dates).size).toBe(29);
    expect(dates[0]).toBe(today);
    expect(dates.at(-1)).toBe(addDays(today, 28));
  } finally {
    await cleanup();
  }
});

it('gives planned jobs only to someone who can open them, and keeps a job’s asset the one its visit is for', async () => {
  const { admin, planner, accounts, cleanup, schedule, asset, annex, site, member, ppmJobs, body } = await fixture();
  try {
    const remote = (
      await admin.post('/api/locations').send({ code: 'REMOTE', name: 'Remote depot', kind: 'site' }).expect(201)
    ).body;
    const [pumpMain, pumpAnnex, pumpRemote] = [
      await asset('Pump main'),
      await asset('Pump annex', annex.id),
      await asset('Pump remote', remote.id),
    ];
    // The technician can work at the main site and the annex, and not at the depot.
    const refused = await planner
      .post(schedules)
      .send({ assets: [{ assetId: pumpRemote.id }], ...body({ assigneeId: member('tech') }) })
      .expect(422);
    expect(refused.body.message).toContain('Remote depot');
    const unassigned = await schedule({ title: 'Depot pump', assets: [{ assetId: pumpRemote.id }] });
    await planner
      .put(schedules + '/' + unassigned.id)
      .send({ ...body({ title: 'Depot pump', assigneeId: member('tech') }), version: unassigned.version })
      .expect(422);
    await planner
      .put(schedules + '/' + unassigned.id)
      .send({ ...body({ title: 'Depot pump' }), version: unassigned.version })
      .expect(200);

    // Access taken away after the schedule was made: the job for the place they can't reach is left for someone to assign.
    const made = await schedule({
      title: 'Two places',
      assigneeId: member('tech'),
      assets: [{ assetId: pumpMain.id }, { assetId: pumpAnnex.id }],
    });
    await admin
      .put('/api/locations/access/' + member('tech'))
      .send({ locationIds: [site.id] })
      .expect(200);
    expect(
      (
        await planner
          .post(schedules + '/' + made.id + '/generate')
          .send({})
          .expect(201)
      ).body.created,
    ).toBe(2);
    const raised = await ppmJobs(made.id);
    expect(raised.map((job) => [job.title, job.status, job.assigneeId])).toEqual([
      ['Two places · Pump annex', 'logged', null],
      ['Two places · Pump main', 'assigned', member('tech')],
    ]);

    // A planned job's asset can't be changed or cleared, because doing the visit on another would count for this one.
    const sibling = await asset('Pump main 2');
    const job = raised.find((candidate) => candidate.title.endsWith('Pump main'))!;
    const patch = async (changes: object) => {
      const version = (await planner.get(jobs + '/' + job.id).expect(200)).body.version;
      return planner.patch(jobs + '/' + job.id).send({ version, ...changes });
    };
    const moved = await patch({ assetId: sibling.id });
    expect(moved.status).toBe(422);
    expect(moved.body.message).toContain('planned maintenance');
    expect((await patch({ assetId: null })).status).toBe(422);
    expect((await patch({ title: 'Two places · Pump main (urgent)' })).status).toBe(200);
    expect((await patch({ assetId: pumpMain.id, title: 'Two places · Pump main' })).status).toBe(200);
    expect(accounts.tech.memberships).toHaveLength(1);
  } finally {
    await cleanup();
  }
});

it('shows and changes a visit’s estimated cost only for people who can see costs, and defaults a meter schedule to floating', async () => {
  const { admin, planner, auditor, cleanup, body, asset, member } = await fixture();
  try {
    // A planner can't see costs, so a cost they send is not kept, and one set by someone who can is not shown to them.
    const withCost = {
      assets: [],
      ...body({ title: 'Costed', estimatedCostMinor: 24300, assigneeId: member('tech') }),
    };
    const bySuper = (await admin.post(schedules).send(withCost).expect(201)).body;
    expect(bySuper.estimatedCostMinor).toBe(24300);
    const byPlanner = (
      await planner
        .post(schedules)
        .send({ ...withCost, title: 'Planner’s' })
        .expect(201)
    ).body;
    expect(byPlanner.estimatedCostMinor).toBeNull();
    const url = schedules + '/' + bySuper.id;
    expect((await planner.get(url).expect(200)).body.estimatedCostMinor).toBeNull();
    expect((await auditor.get(url).expect(200)).body.estimatedCostMinor).toBeNull();
    expect((await admin.get(url).expect(200)).body.estimatedCostMinor).toBe(24300);
    // Editing everything else leaves the cost as it was, whatever the planner's form sent.
    await planner
      .put(url)
      .send({ ...body({ title: 'Costed (renamed)', assigneeId: member('tech') }), version: bySuper.version })
      .expect(200);
    expect((await admin.get(url).expect(200)).body).toMatchObject({
      title: 'Costed (renamed)',
      estimatedCostMinor: 24300,
    });
    await planner
      .put(url)
      .send({ ...body({ title: 'Costed (renamed)', estimatedCostMinor: 1, assigneeId: member('tech') }), version: 2 })
      .expect(200);
    expect((await admin.get(url).expect(200)).body.estimatedCostMinor).toBe(24300);
    // Someone who can see costs changes it, and clears it.
    const changed = (
      await admin
        .put(url)
        .send({
          ...body({ title: 'Costed (renamed)', estimatedCostMinor: 30000, assigneeId: member('tech') }),
          version: 3,
        })
        .expect(200)
    ).body;
    expect(changed.estimatedCostMinor).toBe(30000);
    expect(
      (
        await admin
          .put(url)
          .send({ ...body({ title: 'Costed (renamed)', assigneeId: member('tech') }), version: 4 })
          .expect(200)
      ).body.estimatedCostMinor,
    ).toBeNull();

    // A meter schedule is due from the last visit and needs no word to say so. Saying fixed is refused.
    const meter = {
      assets: [],
      ...body({ title: 'By hours', frequency: { type: 'meter', meterName: 'Run hours', interval: '250' } }),
    };
    delete (meter as { mode?: string }).mode;
    const made = (await planner.post(schedules).send(meter).expect(201)).body;
    expect(made).toMatchObject({
      mode: 'floating',
      frequency: { type: 'meter', meterName: 'Run hours', interval: '250' },
    });
    await planner
      .post(schedules)
      .send({ ...meter, mode: 'fixed' })
      .expect(400);
    const calendar = { assets: [], ...body({ title: 'By calendar' }) };
    delete (calendar as { mode?: string }).mode;
    expect((await planner.post(schedules).send(calendar).expect(201)).body.mode).toBe('fixed');
    expect(asset).toBeDefined();
  } finally {
    await cleanup();
  }
});

it('changes several schedules at once and reports what happened to each', async () => {
  const { planner, auditor, tech, reporter, cleanup, schedule, member } = await fixture();
  const stranger = await fixture();
  try {
    const [a, b] = [await schedule({ title: 'Schedule A' }), await schedule({ title: 'Schedule B' })];
    const bulk = (body: object) => planner.post(schedules + '/bulk').send(body);

    const assigned = (
      await bulk({
        action: 'assign',
        assigneeId: member('tech'),
        items: [a, b].map(({ id, version }) => ({ id, version })),
      }).expect(201)
    ).body;
    expect(assigned).toMatchObject({ succeeded: 2, failed: 0 });
    expect((await planner.get(schedules + '/' + a.id).expect(200)).body.assigneeId).toBe(member('tech'));

    // A schedule that has moved on, one that is not there and a good one each get their own result.
    const mixed = (
      await bulk({
        action: 'active',
        active: false,
        items: [
          { id: a.id, version: a.version },
          { id: b.id, version: assigned.results[1].version },
          { id: randomUUID(), version: 1 },
        ],
      }).expect(201)
    ).body;
    expect(mixed.results.map((r: { ok: boolean; status?: number }) => [r.ok, r.status])).toEqual([
      [false, 409],
      [true, undefined],
      [false, 404],
    ]);
    expect((await planner.get(schedules + '/' + b.id).expect(200)).body.active).toBe(false);

    const priority = (
      await bulk({ action: 'priority', priority: 1, items: [{ id: b.id, version: mixed.results[1].version }] }).expect(
        201,
      )
    ).body;
    expect(priority).toMatchObject({ succeeded: 1, failed: 0 });
    expect((await planner.get(schedules + '/' + b.id).expect(200)).body).toMatchObject({ priority: 1, active: false });

    // Someone who cannot work on the schedules' assets is refused for that row only.
    const refused = (
      await bulk({
        action: 'assign',
        assigneeId: member('reporter'),
        items: [{ id: b.id, version: priority.results[0].version }],
      }).expect(201)
    ).body;
    expect(refused).toMatchObject({ succeeded: 0, failed: 1 });

    // Bad input is refused whole, and each role needs ppm.manage.
    await bulk({ action: 'assign', assigneeId: null, items: [] }).expect(400);
    await bulk({ action: 'priority', priority: 5, items: [{ id: a.id, version: 1 }] }).expect(400);
    await bulk({ action: 'delete', items: [{ id: a.id, version: 1 }] }).expect(400);
    await bulk({
      action: 'assign',
      assigneeId: null,
      items: [
        { id: a.id, version: 1 },
        { id: a.id, version: 1 },
      ],
    }).expect(400);
    for (const agent of [auditor, tech, reporter]) {
      await agent
        .post(schedules + '/bulk')
        .send({ action: 'active', active: false, items: [{ id: a.id, version: 1 }] })
        .expect(403);
    }

    // Schedules in another organisation answer 404, so they show as failed rows.
    const theirs = await stranger.schedule();
    const cross = (
      await bulk({ action: 'active', active: false, items: [{ id: theirs.id, version: theirs.version }] }).expect(201)
    ).body;
    expect(cross).toMatchObject({ succeeded: 0, failed: 1 });
    expect(cross.results[0]).toMatchObject({ ok: false, status: 404 });
    expect((await stranger.planner.get(schedules + '/' + theirs.id).expect(200)).body.active).toBe(true);
  } finally {
    await stranger.cleanup();
    await cleanup();
  }
});

it('exports PPM schedules as CSV for the signed-in organisation only, and audits the export', async () => {
  const { admin, reporter, schedule, tenant, cleanup } = await fixture();
  const stranger = await fixture();
  try {
    await schedule({ title: '=Pump annual service' });
    await stranger.schedule({ title: 'Their schedule' });
    const res = await admin.get(`${schedules}/export`).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('ppm-schedules.csv');
    expect(res.text).toContain('number,title,discipline,criticality');
    expect(res.text).toContain("'=Pump annual service");
    expect(res.text).not.toContain('Their schedule');
    await reporter.get(`${schedules}/export`).expect(403);
    const events = await withTenant(db, tenant.id, (tx) =>
      tx.auditEvent.findMany({ where: { action: 'ppm.schedule.exported' } }),
    );
    expect(events).toHaveLength(1);
  } finally {
    await cleanup();
    await stranger.cleanup();
  }
});
