/**
 * Proves row-level security holds for the application role (cafm_app), which
 * is what the API connects as. Needs a migrated and seeded database.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient, seedId, withAccount, withTenant } from '../src';

const url = process.env.APP_DATABASE_URL;
if (!url) throw new Error('APP_DATABASE_URL is required for the RLS tests');
const db = new PrismaClient({ datasourceUrl: url });
afterAll(() => db.$disconnect());

const demo = seedId('tenant:demo-estates');
const starter = seedId('tenant:starter-demo');

describe('row-level security on membership', () => {
  it('connects as a role that cannot bypass RLS', async () => {
    const [row] = await db.$queryRaw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    expect(row).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it('returns nothing when no tenant is set (fails closed)', async () => {
    expect(await db.membership.count()).toBe(0);
  });

  it('returns only the current tenant’s rows', async () => {
    const rows = await withTenant(db, starter, (tx) => tx.membership.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.tenantId))).toEqual(new Set([starter]));
  });

  it('cannot read another tenant’s row even by id', async () => {
    const demoRow = seedId('membership:demo-estates:superuser');
    const found = await withTenant(db, starter, (tx) => tx.membership.findUnique({ where: { id: demoRow } }));
    expect(found).toBeNull();
  });

  it('cannot write a row into another tenant', async () => {
    const write = withTenant(db, starter, (tx) =>
      tx.membership.create({
        data: { tenantId: demo, accountId: seedId('account:starter'), role: 'requester', licence: 'requester' },
      }),
    );
    await expect(write).rejects.toThrow(/row-level security/);
  });

  it('cannot move a row into another tenant', async () => {
    const id = seedId('membership:starter-demo:starter');
    const move = withTenant(db, starter, (tx) => tx.membership.update({ where: { id }, data: { tenantId: demo } }));
    await expect(move).rejects.toThrow(/row-level security/);
  });

  it('lets an account see only its own memberships during sign-in', async () => {
    const rows = await withAccount(db, seedId('account:technician'), (tx) => tx.membership.findMany());
    expect(rows.map((r) => r.id)).toEqual([seedId('membership:demo-estates:technician')]);
  });

  it('never lets the sign-in (account) context change memberships', async () => {
    const accountId = seedId('account:technician');
    const changed = await withAccount(db, accountId, async (tx) => ({
      updated: (await tx.membership.updateMany({ where: { accountId }, data: { role: 'super_user' } })).count,
      deleted: (await tx.membership.deleteMany({ where: { accountId } })).count,
    }));
    expect(changed).toEqual({ updated: 0, deleted: 0 });
    const insert = withAccount(db, accountId, (tx) =>
      tx.membership.create({ data: { tenantId: starter, accountId, role: 'super_user', licence: 'full' } }),
    );
    await expect(insert).rejects.toThrow(/row-level security/);
  });

  it('cannot read or change the migration history', async () => {
    await expect(db.$queryRaw`SELECT count(*) FROM "_prisma_migrations"`).rejects.toThrow(/permission denied/);
  });

  it('does not leak the tenant context to the next transaction', async () => {
    await withTenant(db, demo, (tx) => tx.membership.count());
    expect(await db.membership.count()).toBe(0);
  });

  it('rejects a tenant id that is not a UUID', async () => {
    await expect(withTenant(db, "x' OR 1=1 --", (tx) => tx.membership.count())).rejects.toThrow(/UUID/);
  });
});

describe('row-level security on access, audit and outbox tables', () => {
  it('roles are isolated per tenant', async () => {
    const roles = await withTenant(db, starter, (tx) => tx.role.findMany());
    expect(roles.length).toBeGreaterThan(0);
    expect(new Set(roles.map((r) => r.tenantId))).toEqual(new Set([starter]));
    const write = withTenant(db, starter, (tx) =>
      tx.role.create({ data: { tenantId: demo, key: 'custom_x', name: 'X', permissions: [] } }),
    );
    await expect(write).rejects.toThrow(/row-level security/);
  });

  it('audit events are append-only for the app', async () => {
    const event = await withTenant(db, starter, (tx) =>
      tx.auditEvent.create({ data: { tenantId: starter, action: 'test.rls', entityType: 'test' } }),
    );
    const update = withTenant(db, starter, (tx) =>
      tx.auditEvent.update({ where: { id: event.id }, data: { action: 'forged' } }),
    );
    await expect(update).rejects.toThrow(/permission denied/);
    const remove = withTenant(db, starter, (tx) => tx.auditEvent.deleteMany({ where: { id: event.id } }));
    await expect(remove).rejects.toThrow(/permission denied/);
  });

  it('the outbox can only be claimed and completed through its functions', async () => {
    const msg = await withTenant(db, starter, (tx) =>
      tx.outboxMessage.create({ data: { tenantId: starter, topic: 'test.rls', payload: { n: 1 } } }),
    );
    const edit = withTenant(db, starter, (tx) =>
      tx.outboxMessage.update({ where: { id: msg.id }, data: { topic: 'x' } }),
    );
    await expect(edit).rejects.toThrow(/permission denied/);
    // Claimed across tenants without any tenant set, then completed.
    const claimed = await db.$queryRaw<{ id: string; attempts: number }[]>`SELECT id, attempts FROM claim_outbox(100)`;
    expect(claimed.find((c) => c.id === msg.id)?.attempts).toBe(1);
    await db.$executeRaw`SELECT complete_outbox(${msg.id}::uuid, NULL)`;
    const again = await db.$queryRaw<{ id: string }[]>`SELECT id FROM claim_outbox(100)`;
    expect(again.find((c) => c.id === msg.id)).toBeUndefined();
  });

  it('entitlement overrides are read-only for the app', async () => {
    const write = withTenant(db, starter, (tx) =>
      tx.tenantEntitlement.create({ data: { tenantId: starter, feature: 'space', enabled: true } }),
    );
    await expect(write).rejects.toThrow(/permission denied/);
  });
});

describe('every tenant table is protected', () => {
  // Platform tables with an optional tenant_id that are deliberately not RLS-scoped
  // (ADR 0004: accounts, sessions and sign-in events are global). Adding to this
  // list needs a reason in review.
  const PLATFORM_TABLES = ['auth_event', 'captured_email', 'session'];

  it('has row-level security on every table with a tenant_id column', async () => {
    const rows = await db.$queryRaw<{ table_name: string; rls: boolean }[]>`
      SELECT c.table_name, cl.relrowsecurity AS rls
      FROM information_schema.columns c
      JOIN pg_class cl ON cl.relname = c.table_name
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = c.table_schema
      WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'`;
    const unprotected = rows.filter((r) => !r.rls && !PLATFORM_TABLES.includes(r.table_name)).map((r) => r.table_name);
    expect(rows.length).toBeGreaterThan(5);
    expect(unprotected).toEqual([]);
  });

  it('invites are isolated per tenant and only findable by exact token hash', async () => {
    const invite = await withTenant(db, demo, (tx) =>
      tx.invite.create({
        data: {
          tenantId: demo,
          email: 'rls@test.example',
          role: 'requester',
          licence: 'requester',
          tokenHash: `rls-${Date.now()}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    );
    expect(await withTenant(db, starter, (tx) => tx.invite.findUnique({ where: { id: invite.id } }))).toBeNull();
    const found = await db.$queryRaw<{ tenant_id: string }[]>`SELECT tenant_id FROM find_invite(${invite.tokenHash})`;
    expect(found).toEqual([{ tenant_id: demo }]);
    expect(await db.$queryRaw<unknown[]>`SELECT * FROM find_invite('nope')`).toEqual([]);
    await withTenant(db, demo, (tx) => tx.invite.delete({ where: { id: invite.id } }));
  });
});
