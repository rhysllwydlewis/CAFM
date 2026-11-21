import { Prisma, PrismaClient } from '@prisma/client';

export { Prisma, PrismaClient };
export type { Tenant, Account, Membership, Session, AuthEvent, Role, Invite } from '@prisma/client';

export { seedId } from './ids';
export { hashToken, newToken } from './tokens';
export { createTenant, listTenants, setTenantPlan, setTenantStatus } from './tenants';

export type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, what: string): void {
  if (!UUID.test(value)) throw new Error(`${what} must be a UUID`);
}

/**
 * Runs `fn` in a transaction with the tenant context set. RLS policies read
 * `app.tenant_id`; it is transaction-local, so it can't leak to another request
 * on the same pooled connection. With no tenant set, tenant-owned tables return nothing.
 */
export async function withTenant<T>(db: PrismaClient, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  assertUuid(tenantId, 'tenantId');
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

/**
 * Runs `fn` with only the account context set, so sign-in can list the
 * signed-in account's own memberships across tenants and nothing else.
 */
export async function withAccount<T>(db: PrismaClient, accountId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  assertUuid(accountId, 'accountId');
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.account_id', ${accountId}, true)`;
    return fn(tx);
  });
}
