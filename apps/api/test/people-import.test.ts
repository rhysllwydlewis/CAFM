import { afterAll, beforeAll, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient, withTenant } from '@cafm/db';
import { createTestAccount, createTestTenant, signIn, startApp } from './helpers';

let app: NestExpressApplication;
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

async function estate(plan?: string, role = 'super_user') {
  const tenant = await createTestTenant(db, plan);
  const owner = await createTestAccount(db, [tenant.tenant.id], undefined, role);
  const { agent } = await signIn(app, owner.email, owner.password);
  return { ...tenant, owner, agent };
}

const people = '/api/people';
const header = 'email,role';
const invites = (tenantId: string) =>
  withTenant(db, tenantId, (tx) => tx.invite.findMany({ orderBy: { createdAt: 'asc' } }));

it('previews every problem, sends nothing, and returns an error report', async () => {
  const { agent, tenant, owner, cleanup } = await estate();
  try {
    const csv = [
      header,
      'new.one@test.example,technician',
      'NEW.ONE@test.example,technician',
      'not-an-email,technician',
      `${owner.email},requester`,
      'a@test.example,castle',
      'b@test.example,',
      ',requester',
    ].join('\n');
    const res = await agent.post(`${people}/import/preview`).send({ csv }).expect(201);
    expect(res.body).toMatchObject({ rows: 7, creates: 0 });
    expect(res.body.issues.map((i: { row: number; column: string }) => `${i.row}:${i.column}`)).toEqual([
      '3:email',
      '4:email',
      '5:email',
      '6:role',
      '7:role',
      '8:email',
    ]);
    const report = await agent.post(`${people}/import/preview?format=csv`).send({ csv }).expect(201);
    expect(report.text).toContain('line,column,problem');
    expect(report.text).toContain('This address is already on line 2.');
    expect(await invites(tenant.id)).toHaveLength(0);
    await agent.post(`${people}/import`).send({ csv }).expect(422);
    expect(await invites(tenant.id)).toHaveLength(0);
    const missing = await agent.post(`${people}/import/preview`).send({ csv: 'email\na@test.example' });
    expect(missing.body.issues[0]).toMatchObject({ column: 'role', message: 'This column is missing.' });
    const extra = await agent
      .post(`${people}/import/preview`)
      .send({ csv: 'email,role,name\na@test.example,requester,A' });
    expect(extra.body.issues[0]).toMatchObject({ column: 'name' });
    await agent.post(`${people}/import/preview`).send({ csv: '' }).expect(400);
    await agent.post(`${people}/import/preview`).send({ csv: 'a', extra: 1 }).expect(400);
  } finally {
    await cleanup();
  }
});

it('sends invitations, records one audit event, and rolls back', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const template = await agent.get(`${people}/import/template`).expect(200);
    expect(template.text.trim()).toBe(header);
    const csv = `${header}\nAda@Test.example,technician\nbob@test.example,requester`;
    const preview = await agent.post(`${people}/import/preview`).send({ csv }).expect(201);
    expect(preview.body).toMatchObject({ rows: 2, creates: 2, issueCount: 0 });
    expect(preview.body.sample.map((s: { code: string }) => s.code)).toEqual(['ada@test.example', 'bob@test.example']);
    expect(await invites(tenant.id)).toHaveLength(0);
    const batch = (await agent.post(`${people}/import`).send({ csv, fileName: 'team.csv' }).expect(201)).body;
    expect(batch).toMatchObject({ entityType: 'invite', rowCount: 2, status: 'applied', fileName: 'team.csv' });
    const rows = await invites(tenant.id);
    expect(rows.map(({ email, role, licence }) => [email, role, licence])).toEqual([
      ['ada@test.example', 'technician', 'mobile'],
      ['bob@test.example', 'requester', 'requester'],
    ]);
    expect((await agent.get(`${people}/import/batches`).expect(200)).body).toMatchObject([{ id: batch.id }]);
    const events = (await agent.get('/api/audit').expect(200)).body;
    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'people.imported', entityId: batch.id })]),
    );
    // A second import to the same address replaces the first pending invitation.
    await agent
      .post(`${people}/import`)
      .send({ csv: `${header}\nada@test.example,requester` })
      .expect(201);
    const pending = (await invites(tenant.id)).filter((i) => !i.revokedAt);
    expect(pending.map((i) => [i.email, i.role]).sort()).toEqual([
      ['ada@test.example', 'requester'],
      ['bob@test.example', 'requester'],
    ]);

    const rolled = await agent.post(`${people}/import/${batch.id}/rollback`).send({}).expect(201);
    expect(rolled.body).toMatchObject({ status: 'rolled_back' });
    // Only the first import's invitations are withdrawn; the later import's one stays pending.
    expect((await invites(tenant.id)).filter((i) => !i.revokedAt).map((i) => [i.email, i.role])).toEqual([
      ['ada@test.example', 'requester'],
    ]);
    await agent.post(`${people}/import/${batch.id}/rollback`).send({}).expect(409);
    const rollbackEvents = await withTenant(db, tenant.id, (tx) =>
      tx.auditEvent.findMany({ where: { action: 'people.import_rolled_back' } }),
    );
    expect(rollbackEvents).toHaveLength(1);
  } finally {
    await cleanup();
  }
});

it('will not roll back an import once someone has accepted', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const batch = (
      await agent
        .post(`${people}/import`)
        .send({ csv: `${header}\ncy@test.example,requester` })
        .expect(201)
    ).body;
    await withTenant(db, tenant.id, (tx) => tx.invite.updateMany({ data: { acceptedAt: new Date() } }));
    await agent.post(`${people}/import/${batch.id}/rollback`).send({}).expect(409);
  } finally {
    await cleanup();
  }
});

it('applies the plan seat limit and the role escalation rule', async () => {
  const { agent, tenant, cleanup } = await estate('free');
  try {
    // The free plan has 3 full users and one is taken.
    const three = `${header}\na@test.example,administrator\nb@test.example,administrator\nc@test.example,administrator`;
    const res = await agent.post(`${people}/import/preview`).send({ csv: three }).expect(201);
    expect(res.body.issues[0].message).toContain('room for 2 more');
    await agent.post(`${people}/import`).send({ csv: three }).expect(422);
    await agent
      .post(`${people}/import`)
      .send({ csv: `${header}\na@test.example,administrator\nb@test.example,administrator\nc@test.example,requester` })
      .expect(201);
    expect(await invites(tenant.id)).toHaveLength(3);

    const admin = await createTestAccount(db, [tenant.id], undefined, 'administrator');
    const asAdmin = (await signIn(app, admin.email, admin.password)).agent;
    const grant = await asAdmin
      .post(`${people}/import/preview`)
      .send({ csv: `${header}\nz@test.example,super_user` })
      .expect(201);
    expect(grant.body.issues).toEqual([
      expect.objectContaining({ row: 2, column: 'role', message: 'You cannot give people this role.' }),
    ]);
    await asAdmin
      .post(`${people}/import`)
      .send({ csv: `${header}\nz@test.example,super_user` })
      .expect(422);
    await admin.cleanup();
  } finally {
    await cleanup();
  }
});

it('refuses people without invite permission and anonymous callers', async () => {
  const { agent, tenant, cleanup } = await estate();
  try {
    const csv = `${header}\na@test.example,requester`;
    const member = await createTestAccount(db, [tenant.id]);
    const requester = (await signIn(app, member.email, member.password)).agent;
    await requester.get(`${people}/import/template`).expect(403);
    await requester.post(`${people}/import/preview`).send({ csv }).expect(403);
    await requester.post(`${people}/import`).send({ csv }).expect(403);
    await requester.get(`${people}/import/batches`).expect(403);
    await requester.post(`${people}/import/00000000-0000-4000-8000-000000000000/rollback`).send({}).expect(403);
    await request(app.getHttpServer()).post(`${people}/import`).send({ csv }).expect(401);
    await agent.get(`${people}/import/batches`).expect(200);
    await member.cleanup();
  } finally {
    await cleanup();
  }
});

it('keeps imports and rollbacks inside one organisation', async () => {
  const first = await estate();
  const second = await estate();
  try {
    const batch = (
      await first.agent
        .post(`${people}/import`)
        .send({ csv: `${header}\nonly@test.example,requester` })
        .expect(201)
    ).body;
    await second.agent.post(`${people}/import/${batch.id}/rollback`).send({}).expect(404);
    expect((await second.agent.get(`${people}/import/batches`).expect(200)).body).toEqual([]);
    expect(await invites(second.tenant.id)).toHaveLength(0);
    expect((await invites(first.tenant.id)).filter((i) => !i.revokedAt)).toHaveLength(1);
    // A member of the other organisation is not "already here" for this one.
    const res = await first.agent
      .post(`${people}/import/preview`)
      .send({ csv: `${header}\n${second.owner.email},requester` })
      .expect(201);
    expect(res.body).toMatchObject({ creates: 1, issueCount: 0 });
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});
