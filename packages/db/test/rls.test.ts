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
