import { randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient, withTenant } from '@cafm/db';
import { outstandingFor, checklistAnswerProblem } from '@cafm/shared';
import { pdfText } from '../src/modules/work-orders/job-sheet';
import { createTestAccount, createTestTenant, ownerDb, startApp, signIn } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const jobs = '/api/work-orders';
const helpdesk = '/api/helpdesk';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
  'base64',
);
const drawing = 'data:image/png;base64,' + png.toString('base64');

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

/** The text a PDF draws, read back from its compressed content streams. */
function pdfStrings(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  let text = '';
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: Buffer;
    try {
      content = inflateSync(Buffer.from(match[1]!, 'latin1'));
    } catch {
      continue;
    }
    for (const hex of content.toString('latin1').matchAll(/<([0-9a-fA-F]+)>/g)) {
      text += Buffer.from(hex[1]!, 'hex').toString('latin1');
    }
  }
  return text;
}

async function fixture() {
  const { tenant, cleanup } = await createTestTenant(db);
  const accounts = {
    admin: await createTestAccount(db, [tenant.id], undefined, 'super_user'),
    manager: await createTestAccount(db, [tenant.id], undefined, 'fm_manager'),
    finance: await createTestAccount(db, [tenant.id], undefined, 'finance'),
    desk: await createTestAccount(db, [tenant.id], undefined, 'helpdesk'),
    tech: await createTestAccount(db, [tenant.id], undefined, 'technician'),
    other: await createTestAccount(db, [tenant.id], undefined, 'technician'),
    reporter: await createTestAccount(db, [tenant.id], undefined, 'requester'),
  };
  await withTenant(db, tenant.id, (tx) =>
    tx.membership.updateMany({
      where: { id: { in: [accounts.tech.memberships[0]!, accounts.other.memberships[0]!] } },
      data: { licence: 'mobile' },
    }),
  );
  const logIn = async ({ email, password }: { email: string; password: string }) =>
    (await signIn(app, email, password)).agent;
  const [admin, manager, finance, desk, tech, other, reporter] = await Promise.all(Object.values(accounts).map(logIn));
  const site = (await admin!.post('/api/locations').send({ code: 'MAIN', name: 'Main site', kind: 'site' }).expect(201))
    .body;
  await admin!
    .put('/api/locations/access/' + accounts.tech.memberships[0])
    .send({ locationIds: [site.id] })
    .expect(200);
  const requestType = (
    await admin!
      .post(helpdesk + '/settings/types')
      .send({ name: 'Water leak', category: 'Plumbing', problemCode: 'Leak' })
      .expect(201)
  ).body;
  const member = (name: keyof typeof accounts) => accounts[name].memberships[0]!;
  const versionOf = async (id: string) => (await manager!.get(jobs + '/' + id).expect(200)).body.version as number;
  /** A job assigned to the technician. */
  const job = async (overrides: Record<string, unknown> = {}) => {
    const created = (
      await manager!
        .post(jobs)
        .send({
          submissionId: randomUUID(),
          title: 'Replace pump seal',
          description: 'Pump in the plant room is weeping.',
          locationId: site.id,
          impact: 2,
          urgency: 2,
          assigneeId: member('tech'),
          ...overrides,
        })
        .expect(201)
    ).body;
    return created as { id: string; number: string };
  };
  const move = async (agent: typeof manager, id: string, status: string, extra: object = {}) => {
    const version = await versionOf(id);
    return agent!.post(jobs + '/' + id + '/status').send({ version, status, ...extra });
  };
  return {
    tenant,
    cleanup,
    accounts,
    admin: admin!,
    manager: manager!,
    finance: finance!,
    desk: desk!,
    tech: tech!,
    other: other!,
    reporter: reporter!,
    site,
    requestType,
    member,
    versionOf,
    job,
    move,
  };
}

it('checks a checklist answer against its kind, and counts what is still to answer', () => {
  expect(checklistAnswerProblem('tick', 'done', null)).toBeNull();
  expect(checklistAnswerProblem('tick', 'yes', null)).not.toBeNull();
  expect(checklistAnswerProblem('pass_fail', 'pass', null)).toBeNull();
  expect(checklistAnswerProblem('pass_fail', 'na', null)).toBeNull();
  expect(checklistAnswerProblem('pass_fail', 'fail', null)).toBe('Say what failed.');
  expect(checklistAnswerProblem('pass_fail', 'fail', 'Leaking seal')).toBeNull();
  expect(checklistAnswerProblem('pass_fail', 'maybe', null)).not.toBeNull();
  for (const good of ['1', '1.4', '-0.5', '123456789.123'])
    expect(checklistAnswerProblem('number', good, null)).toBeNull();
  for (const bad of ['', 'abc', '1,4', '1.4567', '1e3', '.5', '1234567890']) {
    expect(checklistAnswerProblem('number', bad, null), bad).not.toBeNull();
  }
  const lists = [
    {
      gate: 'start' as const,
      items: [
        { required: true, answer: null },
        { required: true, answer: 'done' },
      ],
    },
    {
      gate: 'completion' as const,
      items: [
        { required: true, answer: null },
        { required: false, answer: null },
      ],
    },
    { gate: 'none' as const, items: [{ required: true, answer: null }] },
  ];
  expect(outstandingFor(lists, 'start')).toBe(1);
  // Completing waits for everything that holds something back, so the one for before starting too.
  expect(outstandingFor(lists, 'complete')).toBe(2);
});

it('writes text into the PDF fonts without drawing the wrong character', () => {
  expect(pdfText('Boiler £48.90 – café')).toBe('Boiler £48.90 – café');
  expect(pdfText('Ŵyr a ŷ')).toBe('Wyr a y');
  expect(pdfText('漢字')).toBe('??');
  expect(pdfText('a\u0000b')).toBe('a b');
});

it('keeps checklists on a job, from a template or written out, and holds back starting and completing', async () => {
  const { admin, manager, tech, reporter, finance, cleanup, job, move, versionOf, tenant } = await fixture();
  const stranger = await fixture();
  try {
    // Templates are an organisation setting: Super Users manage them, everyone who works with jobs can use them.
    const isolation = {
      title: 'Safe isolation',
      gate: 'start',
      items: [
        { label: 'Circuit isolated', kind: 'tick', required: true },
        { label: 'Voltage proved absent', kind: 'pass_fail', required: true },
        { label: 'Notes', kind: 'text', required: false },
      ],
    };
    await manager.post('/api/checklist-templates').send(isolation).expect(403);
    await tech.post('/api/checklist-templates').send(isolation).expect(403);
    const template = (await admin.post('/api/checklist-templates').send(isolation).expect(201)).body;
    expect(template).toMatchObject({ name: 'Safe isolation', gate: 'start' });
    await admin.post('/api/checklist-templates').send(isolation).expect(409);
    await admin
      .post('/api/checklist-templates')
      .send({ ...isolation, title: 'Bad', items: [{ label: 'Tick', kind: 'tick', unit: 'bar' }] })
      .expect(400);
    await admin
      .post('/api/checklist-templates')
      .send({ ...isolation, title: 'Empty', items: [] })
      .expect(400);
    expect((await tech.get('/api/checklist-templates').expect(200)).body).toHaveLength(1);
    await reporter.get('/api/checklist-templates').expect(403);

    const created = await job();
    const url = jobs + '/' + created.id + '/checklists';
    await tech.post(url).send({ templateId: template.id }).expect(403);
    await reporter.get(url).expect(403);
    await manager.post(url).send({ templateId: randomUUID() }).expect(404);
    await manager.post(url).send({ title: 'Empty', gate: 'none', items: [] }).expect(400);
    await manager.post(url).send({ templateId: template.id }).expect(201);
    const lists = (
      await manager
        .post(url)
        .send({
          title: 'Plant room',
          gate: 'completion',
          items: [
            { label: 'Pressure (bar)', kind: 'number', required: true, unit: 'bar' },
            { label: 'Left tidy', kind: 'tick', required: true },
            { label: 'Anything else', kind: 'text', required: false },
          ],
        })
        .expect(201)
    ).body;
    expect(lists).toHaveLength(2);
    // A checklist is a copy: the template changing later does not rewrite the job.
    expect(lists[0]).toMatchObject({ title: 'Safe isolation', gate: 'start', outstanding: 2 });
    expect(lists[1]).toMatchObject({ title: 'Plant room', gate: 'completion', outstanding: 2 });
    const [start, plant] = lists as { id: string; items: { id: string }[] }[];

    // Going on site waits for the required steps of the before-starting checklist, and says how many.
    const blocked = await move(tech, created.id, 'on_site');
    expect(blocked.status).toBe(422);
    expect(blocked.body).toMatchObject({
      code: 'checklist_incomplete',
      message: 'Answer 2 required checklist steps before starting work.',
    });
    const answer = (list: { id: string }, item: { id: string }, body: object, as = tech) =>
      as.put(`${url}/${list.id}/items/${item.id}`).send(body);
    // Each answer is checked against its kind.
    expect((await answer(start!, start!.items[0]!, { answer: 'yes' })).status).toBe(422);
    expect((await answer(start!, start!.items[1]!, { answer: 'fail' })).body.message).toBe('Say what failed.');
    expect((await answer(plant!, plant!.items[0]!, { answer: 'about 1.4' })).status).toBe(422);
    expect((await answer(start!, start!.items[0]!, { answer: 'done' })).status).toBe(200);
    // A failed step is an answer, with its reason. It does not stop the work.
    const failed = (await answer(start!, start!.items[1]!, { answer: 'fail', note: 'Live at the board' })).body;
    expect(failed[0].items[1]).toMatchObject({ answer: 'fail', note: 'Live at the board' });
    expect(failed[0].items[1].answeredByName).toBe('Test Person');
    expect(failed[0].outstanding).toBe(0);
    // Clearing an answer puts the step back, and holds the job back again.
    expect((await answer(start!, start!.items[0]!, { answer: null })).body[0].outstanding).toBe(1);
    expect((await move(tech, created.id, 'on_site')).status).toBe(422);
    await answer(start!, start!.items[0]!, { answer: 'done' }).expect(200);
    expect((await move(tech, created.id, 'on_site')).status).toBe(201);

    // Completing waits for every checklist that holds something back. Optional steps never do.
    const early = await move(tech, created.id, 'completed');
    expect(early.body).toMatchObject({
      code: 'checklist_incomplete',
      message: 'Answer 2 required checklist steps before completing the job.',
    });
    await answer(plant!, plant!.items[0]!, { answer: '1.4' }).expect(200);
    await answer(plant!, plant!.items[1]!, { answer: 'done' }).expect(200);
    expect((await move(tech, created.id, 'completed')).status).toBe(201);
    // The step the technician left (the optional comment) did not matter.
    expect((await manager.get(url).expect(200)).body[1].items[2].answer).toBeNull();

    // A step that isn't on this job is not found, and another organisation's staff cannot see or change any of it.
    await tech.put(`${url}/${start!.id}/items/${randomUUID()}`).send({ answer: 'done' }).expect(404);
    await tech.put(`${url}/${plant!.id}/items/${start!.items[0]!.id}`).send({ answer: 'done' }).expect(404);
    await stranger.admin.get(url).expect(404);
    await stranger.admin.post(url).send({ templateId: template.id }).expect(404);
    await stranger.admin.put(`${url}/${start!.id}/items/${start!.items[0]!.id}`).send({ answer: 'done' }).expect(404);
    await stranger.admin.delete(`${url}/${start!.id}`).expect(404);
    // Someone limited to their own work cannot answer on a job that isn't theirs.
    const mine = await job({ assigneeId: undefined, title: 'Not the technician’s' });
    const list = (
      await manager
        .post(jobs + '/' + mine.id + '/checklists')
        .send({ templateId: template.id })
        .expect(201)
    ).body[0];
    await tech.get(jobs + '/' + mine.id + '/checklists').expect(404);
    await tech
      .put(`${jobs}/${mine.id}/checklists/${list.id}/items/${list.items[0].id}`)
      .send({ answer: 'done' })
      .expect(404);

    // Removing a checklist is a supervisor's, and a closed or cancelled job's checklists are fixed.
    await tech.delete(`${url}/${plant!.id}`).expect(403);
    await finance.delete(`${url}/${plant!.id}`).expect(403);
    expect((await manager.delete(`${url}/${plant!.id}`).expect(200)).body).toHaveLength(1);
    const cancelled = await job({ title: 'Cancelled job' });
    await manager
      .post(jobs + '/' + cancelled.id + '/checklists')
      .send({ templateId: template.id })
      .expect(201);
    await move(manager, cancelled.id, 'cancelled').then((res) => expect(res.status).toBe(201));
    await manager
      .post(jobs + '/' + cancelled.id + '/checklists')
      .send({ templateId: template.id })
      .expect(422);

    // The cap, and the audit trail.
    const crowded = await job({ title: 'Crowded' });
    for (let count = 0; count < 10; count += 1) {
      await manager
        .post(jobs + '/' + crowded.id + '/checklists')
        .send({ templateId: template.id })
        .expect(201);
    }
    await manager
      .post(jobs + '/' + crowded.id + '/checklists')
      .send({ templateId: template.id })
      .expect(422);
    const audited = await withTenant(db, tenant.id, (tx) =>
      tx.auditEvent.findMany({
        where: { entityId: created.id, action: { startsWith: 'work_order_checklist.' } },
        select: { action: true },
      }),
    );
    const count = (action: string) => audited.filter((event) => event.action === action).length;
    expect(count('work_order_checklist.add')).toBe(2);
    expect(count('work_order_checklist.answer')).toBe(6);
    expect(count('work_order_checklist.remove')).toBe(1);
    expect(await versionOf(created.id)).toBeGreaterThan(1);

    // A name at the length limit is freed too, and a replacement can take it.
    const longName = { ...isolation, title: 'T'.repeat(120) };
    const longTemplate = (await admin.post('/api/checklist-templates').send(longName).expect(201)).body;
    await admin.delete('/api/checklist-templates/' + longTemplate.id).expect(200);
    await admin.post('/api/checklist-templates').send(longName).expect(201);

    // Retiring a template keeps the jobs that used it and frees its name.
    await manager.delete('/api/checklist-templates/' + template.id).expect(403);
    await admin.delete('/api/checklist-templates/' + template.id).expect(200);
    expect(
      (await manager.get('/api/checklist-templates').expect(200)).body.map(({ name }: { name: string }) => name),
    ).toEqual(['T'.repeat(120)]);
    await admin.post('/api/checklist-templates').send(isolation).expect(201);
    expect((await manager.get(url).expect(200)).body).toHaveLength(1);
  } finally {
    await stranger.cleanup();
    await cleanup();
  }
});

it('holds a contractor on a link to the same checklists, and lets them answer from it', async () => {
  const { admin, manager, cleanup, job, tenant } = await fixture();
  const anon = () => request(app.getHttpServer());
  try {
    const created = await job({ assigneeId: undefined });
    const url = jobs + '/' + created.id;
    await manager
      .post(url + '/checklists')
      .send({
        title: 'Before you start',
        gate: 'start',
        items: [
          { label: 'Permit checked', kind: 'tick', required: true },
          { label: 'Reading', kind: 'number', required: false, unit: 'bar' },
        ],
      })
      .expect(201);
    await manager
      .post(url + '/contractor')
      .send({ version: 1, name: 'Sparks Electrical Ltd', email: 'jobs@sparks.test' })
      .expect(201);
    const mail = await withTenant(db, tenant.id, (tx) =>
      tx.outboxMessage.findMany({ where: { topic: 'email.send' }, orderBy: { createdAt: 'desc' } }),
    );
    const token = /\/job\/([\w-]+)/.exec(
      mail.map(({ payload }) => payload as { to: string; text: string }).find(({ to }) => to === 'jobs@sparks.test')
        ?.text ?? '',
    )![1]!;
    const link = '/api/contractor-jobs/' + token;
    const seen = (await anon().get(link).expect(200)).body;
    expect(seen.checklists).toMatchObject([{ title: 'Before you start', gate: 'start', outstanding: 1 }]);
    const blocked = await anon()
      .post(link + '/status')
      .send({ status: 'on_site' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.code).toBe('checklist_incomplete');
    const [required, optional] = seen.checklists[0].items as { id: string }[];
    // A member's answer reaches the contractor under the team's name, never the person's.
    await manager
      .put(`${url}/checklists/${seen.checklists[0].id}/items/${optional!.id}`)
      .send({ answer: '1.1' })
      .expect(200);
    const staffAnswered = (await anon().get(link).expect(200)).body;
    expect(staffAnswered.checklists[0].items[1]).toMatchObject({ answer: '1.1', answeredByName: 'Facilities team' });
    expect(JSON.stringify(staffAnswered)).not.toContain('Test Person');
    await anon()
      .put(link + '/checklist-items/' + required!.id)
      .send({ answer: 'ticked' })
      .expect(422);
    await anon()
      .put(link + '/checklist-items/' + randomUUID())
      .send({ answer: 'done' })
      .expect(404);
    const after = (
      await anon()
        .put(link + '/checklist-items/' + required!.id)
        .send({ answer: 'done' })
        .expect(200)
    ).body;
    expect(after.checklists[0]).toMatchObject({ outstanding: 0 });
    expect(after.checklists[0].items[0]).toMatchObject({ answer: 'done', answeredByName: 'Sparks Electrical Ltd' });
    await anon()
      .put(link + '/checklist-items/' + optional!.id)
      .send({ answer: '1.4' })
      .expect(200);
    await anon()
      .post(link + '/status')
      .send({ status: 'on_site' })
      .expect(201);
    // Their answers are audited as theirs.
    const audited = await withTenant(db, tenant.id, (tx) =>
      tx.auditEvent.findMany({ where: { entityId: created.id, action: 'work_order_checklist.answer' } }),
    );
    // One answer from staff, two from the contractor, and theirs are audited as theirs.
    expect(audited).toHaveLength(3);
    expect(audited.filter(({ changes }) => (changes as { via?: string }).via === 'contractor_link')).toHaveLength(2);
    expect(audited.map(({ changes }) => changes)).toContainEqual(
      expect.objectContaining({ via: 'contractor_link', contractor: 'Sparks Electrical Ltd' }),
    );
    // A link for one job does not reach another organisation's checklist step.
    const stranger = await fixture();
    try {
      const theirs = await stranger.job({ assigneeId: undefined });
      const list = (
        await stranger.manager
          .post(jobs + '/' + theirs.id + '/checklists')
          .send({ title: 'Theirs', gate: 'none', items: [{ label: 'Step', kind: 'tick', required: false }] })
          .expect(201)
      ).body[0];
      await anon()
        .put(link + '/checklist-items/' + list.items[0].id)
        .send({ answer: 'done' })
        .expect(404);
    } finally {
      await stranger.cleanup();
    }
    await admin.get(url + '/checklists').expect(200);
  } finally {
    await cleanup();
  }
});

it('keeps before and after photos on a job for the people who do it, and no one else', async () => {
  const { manager, tech, other, reporter, finance, cleanup, job, move } = await fixture();
  const stranger = await fixture();
  try {
    const created = await job();
    const url = jobs + '/' + created.id + '/photos';
    const photo = (name = 'leak.png', query = '?phase=before&caption=Seal%20weeping') =>
      tech.put(url + query).attach('file', png, name);
    const first = (await photo().expect(200)).body;
    expect(first).toMatchObject({ filename: 'leak.png', phase: 'before', caption: 'Seal weeping' });
    // A retry of the same upload does not add a second copy.
    expect((await photo().expect(200)).body.id).toBe(first.id);
    const after = Buffer.concat([png, Buffer.alloc(8)]);
    await tech
      .put(url + '?phase=after')
      .attach('file', after, 'done.png')
      .expect(200);
    const listed = (await manager.get(url).expect(200)).body;
    expect(listed.map((item: { phase: string }) => item.phase)).toEqual(['before', 'after']);

    // The same file given a different phase is a different photo, not a replay that loses the phase.
    const relabelled = (await photo('leak.png', '?phase=after&caption=Seal%20weeping').expect(200)).body;
    expect(relabelled.id).not.toBe(first.id);
    expect((await manager.get(url).expect(200)).body.map((item: { phase: string }) => item.phase)).toEqual([
      'before',
      'after',
      'after',
    ]);

    // Only photos, and a phase from the list.
    await tech.put(url).attach('file', Buffer.from('<svg/>'), 'x.svg').expect(415);
    await tech
      .put(url + '?phase=during')
      .attach('file', png, 'a.png')
      .expect(400);
    await tech
      .put(url + '?phase=other&caption=' + 'x'.repeat(151))
      .attach('file', png, 'b.png')
      .expect(400);
    await tech.put(url).expect(400);

    // The file comes back as it went in, and cannot be run as a page.
    const download = await tech.get(url + '/' + first.id).expect(200);
    expect(download.headers['content-type']).toContain('image/png');
    expect(download.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.from(download.body).equals(png)).toBe(true);

    // The people who do the job can add photos, as far as their scope allows. Others can't.
    await reporter.get(url).expect(403);
    await reporter.put(url).attach('file', png, 'r.png').expect(403);
    await finance.put(url).attach('file', png, 'd.png').expect(403);
    await other.get(url).expect(404);
    await other.put(url).attach('file', png, 'o.png').expect(404);
    await stranger.admin.get(url).expect(404);
    await stranger.admin.get(url + '/' + first.id).expect(404);
    await stranger.admin.put(url).attach('file', png, 's.png').expect(404);

    // Removing a photo is a supervisor's, and the file goes with it.
    await tech.delete(url + '/' + first.id).expect(403);
    await stranger.admin.delete(url + '/' + first.id).expect(404);
    await manager.delete(url + '/' + first.id).expect(200);
    await manager.get(url + '/' + first.id).expect(404);
    expect((await manager.get(url).expect(200)).body).toHaveLength(2);

    // Photos stop at closed and cancelled.
    await move(manager, created.id, 'cancelled').then((res) => expect(res.status).toBe(201));
    await tech.put(url).attach('file', png, 'late.png').expect(422);
  } finally {
    await stranger.cleanup();
    await cleanup();
  }
});

it('records the customer’s and the technician’s sign-off, once each, from a drawing', async () => {
  const { manager, tech, reporter, finance, cleanup, job, move, tenant, accounts } = await fixture();
  const stranger = await fixture();
  try {
    const created = await job();
    const url = jobs + '/' + created.id + '/signatures';
    const sign = (body: object, as = tech) => as.post(url).send(body);
    // Not until the work has started.
    expect((await sign({ role: 'technician', image: drawing })).status).toBe(422);
    await move(tech, created.id, 'on_site').then((res) => expect(res.status).toBe(201));

    // A drawing, and a name for the customer.
    expect((await sign({ role: 'customer', image: drawing })).body.message).toBe('Enter the customer’s name.');
    expect((await sign({ role: 'customer', signerName: 'Hana Patel', image: 'nope' })).status).toBe(422);
    expect(
      (await sign({ role: 'customer', signerName: 'Hana Patel', image: 'data:image/png;base64,AAAA' })).status,
    ).toBe(422);
    expect(
      (
        await sign({
          role: 'customer',
          signerName: 'Hana Patel',
          image: 'data:image/png;base64,' + 'A'.repeat(300_000),
        })
      ).status,
    ).toBe(413);
    expect(
      (await sign({ role: 'customer', signerName: 'Hana Patel', image: 'data:image/png;base64,' + 'A'.repeat(90_000) }))
        .status,
    ).toBe(400);
    expect((await sign({ role: 'witness', signerName: 'X', image: drawing })).status).toBe(400);
    const customer = (await sign({ role: 'customer', signerName: ' Hana Patel ', image: drawing }).expect(201)).body;
    expect(customer).toMatchObject([{ role: 'customer', signerName: 'Hana Patel', recordedByName: 'Test Person' }]);
    // The technician's name is the signed-in technician's, whatever was sent.
    const both = (await sign({ role: 'technician', signerName: 'Someone Else', image: drawing }).expect(201)).body;
    expect(both.map((item: { role: string }) => item.role).sort()).toEqual(['customer', 'technician']);
    expect(both.find((item: { role: string }) => item.role === 'technician').signerName).toBe('Test Person');

    // Each can be given once. A supervisor removes one to sign again, and that is audited.
    expect((await sign({ role: 'customer', signerName: 'Hana Patel', image: drawing })).status).toBe(409);
    const stored = customer[0];
    await tech.delete(url + '/' + stored.id).expect(403);
    await stranger.admin.delete(url + '/' + stored.id).expect(404);
    const image = await manager.get(url + '/' + stored.id + '/image').expect(200);
    expect(image.headers['content-type']).toContain('image/png');
    expect(Buffer.from(image.body).equals(png)).toBe(true);
    await stranger.admin.get(url + '/' + stored.id + '/image').expect(404);
    await manager.delete(url + '/' + stored.id).expect(200);
    await manager.get(url + '/' + stored.id + '/image').expect(404);
    await sign({ role: 'customer', signerName: 'Hana Patel', image: drawing }).expect(201);
    const audited = await withTenant(db, tenant.id, (tx) =>
      tx.auditEvent.findMany({
        where: { entityId: created.id, action: { startsWith: 'work_order_signature.' } },
        select: { action: true },
      }),
    );
    expect(audited.map((event) => event.action).sort()).toEqual([
      'work_order_signature.add',
      'work_order_signature.add',
      'work_order_signature.add',
      'work_order_signature.remove',
    ]);

    // A technician whose account name is as long as names may be can still sign.
    const technicianSignature = both.find((item: { role: string }) => item.role === 'technician');
    await manager.delete(url + '/' + technicianSignature.id).expect(200);
    const owner = ownerDb();
    try {
      await owner.account.update({ where: { id: accounts.tech.account.id }, data: { name: 'N'.repeat(120) } });
    } finally {
      await owner.$disconnect();
    }
    const long = (await sign({ role: 'technician', image: drawing }).expect(201)).body;
    expect(long.find((item: { role: string }) => item.role === 'technician').signerName).toHaveLength(120);

    // Drawings are not photos, and who can see them follows the job.
    await reporter.get(url).expect(403);
    await finance.post(url).send({ role: 'customer', signerName: 'X', image: drawing }).expect(403);
    await stranger.admin.get(url).expect(404);
    expect((await manager.get(jobs + '/' + created.id + '/photos').expect(200)).body).toEqual([]);
    // A removed signature leaves no file behind.
    const files = await withTenant(db, tenant.id, (tx) =>
      tx.recordAttachment.count({ where: { workOrderId: created.id } }),
    );
    expect(files).toBe(2);
  } finally {
    await stranger.cleanup();
    await cleanup();
  }
});

it('makes a job sheet as a PDF, shows money only to those who can see costs, and emails the customer copy', async () => {
  const {
    admin,
    manager,
    finance,
    desk,
    tech,
    reporter,
    cleanup,
    job,
    move,
    requestType,
    site,
    member,
    tenant,
    accounts,
  } = await fixture();
  const stranger = await fixture();
  try {
    // A job raised from a request, so there is someone to send the sheet to.
    const reported = (
      await reporter
        .post(helpdesk + '/requests')
        .send({
          submissionId: randomUUID(),
          title: 'Water leak',
          description: 'Water near a socket.',
          locationId: site.id,
          typeId: requestType.id,
        })
        .expect(201)
    ).body;
    const created = (
      await desk
        .post(jobs + '/from-request/' + reported.id)
        .send({
          submissionId: randomUUID(),
          requestVersion: 1,
          jobs: [{ title: 'Stop the leak ŵ', assigneeId: member('tech') }],
        })
        .expect(201)
    ).body[0] as { id: string; number: string };
    const url = jobs + '/' + created.id;
    await manager
      .post(url + '/comments')
      .send({ body: 'Gate code is 1234', internal: true })
      .expect(201);
    await manager
      .post(url + '/comments')
      .send({ body: 'Seal replaced and tested.' })
      .expect(201);
    await manager
      .post(url + '/costs')
      .send({
        kind: 'parts',
        quantityMilli: 1000,
        unitCostMinor: 4890,
        description: 'PRV 3 bar',
        incurredOn: new Date().toISOString().slice(0, 10),
      })
      .expect(201);
    await manager
      .post(url + '/checklists')
      .send({
        title: 'Tidy up',
        gate: 'none',
        items: [{ label: 'Area left clean', kind: 'tick', required: false }],
      })
      .expect(201);
    await move(tech, created.id, 'on_site').then((res) => expect(res.status).toBe(201));
    await tech
      .put(url + '/photos?phase=after&caption=Finished')
      .attach('file', png, 'after.png')
      .expect(200);
    await tech
      .post(url + '/signatures')
      .send({ role: 'technician', image: drawing })
      .expect(201);

    const pdfOf = async (agent: typeof manager) => {
      const response = await agent
        .get(url + '/job-sheet')
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });
      return response;
    };
    const full = await pdfOf(manager);
    expect(full.status).toBe(200);
    expect(full.headers['content-type']).toContain('application/pdf');
    expect(full.headers['content-disposition']).toContain(`job-sheet-${created.number}.pdf`);
    const bytes = full.body as Buffer;
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const text = pdfStrings(bytes);
    for (const shown of [
      created.number,
      'Stop the leak',
      'Seal replaced and tested.',
      'Area left clean',
      'PRV 3 bar',
      'Test Tenant Ltd',
    ]) {
      expect(text, shown).toContain(shown);
    }
    // Staff with costs see them. An internal note never appears, and the Welsh letter is drawn as its base letter.
    expect(text).toContain('Total (excluding VAT)');
    expect(text).not.toContain('1234');
    expect(text).toContain('Stop the leak w');
    // Finance sees costs too; Helpdesk and the technician, who cannot, get a sheet without any money.
    expect(pdfStrings((await pdfOf(finance)).body as Buffer)).toContain('Total (excluding VAT)');
    for (const agent of [desk, tech]) {
      const plain = await pdfOf(agent);
      expect(plain.status).toBe(200);
      expect(pdfStrings(plain.body as Buffer)).not.toContain('Total (excluding VAT)');
      expect(pdfStrings(plain.body as Buffer)).not.toContain('PRV 3 bar');
    }
    await reporter.get(url + '/job-sheet').expect(403);
    await stranger.admin.get(url + '/job-sheet').expect(404);

    // It can be emailed once the work is done, by someone who can edit the job, and only to the requester.
    const mailed = async () =>
      withTenant(db, tenant.id, (tx) =>
        tx.outboxMessage.findMany({ where: { topic: 'email.send' }, orderBy: { createdAt: 'asc' } }),
      );
    const before = (await mailed()).length;
    await manager
      .post(url + '/job-sheet/email')
      .send({})
      .expect(422);
    await tech
      .post(url + '/job-sheet/email')
      .send({})
      .expect(403);
    await finance
      .post(url + '/job-sheet/email')
      .send({})
      .expect(403);
    await stranger.admin
      .post(url + '/job-sheet/email')
      .send({})
      .expect(404);
    await move(tech, created.id, 'completed', { note: 'Fitted a new seal and tested it.' }).then((res) =>
      expect(res.status).toBe(201),
    );
    expect(
      (
        await manager
          .post(url + '/job-sheet/email')
          .send({})
          .expect(201)
      ).body,
    ).toEqual({ sent: true });
    const messages = (await mailed()).slice(before);
    const sheet = messages
      .map(
        ({ payload }) =>
          payload as {
            to: string;
            subject: string;
            text: string;
            attachments?: { filename: string; contentBase64: string }[];
          },
      )
      .find(({ attachments }) => attachments?.length);
    expect(sheet).toBeDefined();
    // Sending it again straight away is refused, so the requester is not flooded.
    await manager
      .post(url + '/job-sheet/email')
      .send({})
      .expect(422);
    expect(
      (await mailed()).slice(before).filter(({ payload }) => (payload as { attachments?: unknown }).attachments),
    ).toHaveLength(1);
    expect(sheet!.to).toBe(accounts.reporter.email);
    expect(sheet!.subject).toContain('Stop the leak');
    expect(sheet!.attachments![0]!.filename).toBe(`job-sheet-${created.number}.pdf`);
    const copy = Buffer.from(sheet!.attachments![0]!.contentBase64, 'base64');
    expect(copy.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // The customer copy has no money, no internal notes and no costs.
    const customerText = pdfStrings(copy);
    expect(customerText).toContain('Seal replaced and tested.');
    // The note given when the job was completed is the work carried out, without the clock's housekeeping.
    expect(customerText).toContain('Fitted a new seal and tested it.');
    expect(customerText).not.toContain('SLA clock');
    expect(customerText).not.toContain('Total (excluding VAT)');
    expect(customerText).not.toContain('PRV 3 bar');
    expect(customerText).not.toContain('1234');
    const audited = await withTenant(db, tenant.id, (tx) =>
      tx.auditEvent.findMany({ where: { entityId: created.id, action: 'work_order.job_sheet_emailed' } }),
    );
    expect(audited).toHaveLength(1);
    expect(JSON.stringify(audited[0]!.changes)).not.toContain('@');

    // A job with no requester has no one to send it to.
    const orphan = await job({ title: 'No requester' });
    await move(tech, orphan.id, 'on_site').then((res) => expect(res.status).toBe(201));
    await move(tech, orphan.id, 'completed').then((res) => expect(res.status).toBe(201));
    const refused = await manager
      .post(jobs + '/' + orphan.id + '/job-sheet/email')
      .send({})
      .expect(422);
    expect(refused.body.message).toContain('no requester');
    await admin.get(jobs + '/' + orphan.id + '/job-sheet').expect(200);
  } finally {
    await stranger.cleanup();
    await cleanup();
  }
});
