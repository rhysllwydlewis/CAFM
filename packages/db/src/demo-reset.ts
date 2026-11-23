import type { PrismaClient } from '@prisma/client';
import { seed, seedRoles } from './seed';

export interface DemoResetResult {
  tenants: number;
  removedAccounts: number;
}

/**
 * The nightly demo reset (doc 06 § Demo operations): removes everything
 * visitors added to demo tenants and puts the seed back. Runs as the owner
 * role, from the worker, only when DEMO_MODE=true.
 *
 * `reseed: false` skips re-running the seed, for tests that reset a
 * throwaway demo tenant without touching the shared demo personas.
 */
export async function resetDemo(
  db: PrismaClient,
  opts: { tenantIds?: string[]; reseed?: boolean } = {},
): Promise<DemoResetResult> {
  const tenants = await db.tenant.findMany({
    where: { demo: true, ...(opts.tenantIds ? { id: { in: opts.tenantIds } } : {}) },
    select: { id: true },
  });
  const tenantIds = tenants.map((t) => t.id);
  if (!tenantIds.length) return { tenants: 0, removedAccounts: 0 };
  const where = { tenantId: { in: tenantIds } };

  // People who joined demo tenants (not the personas), and any account left with no organisation.
  const visitorMemberships = await db.membership.findMany({
    where: { ...where, account: { isDemo: false } },
    select: { id: true, accountId: true },
  });
  const visitorAccounts = [...new Set(visitorMemberships.map((m) => m.accountId))];

  await db.$transaction([
    db.session.deleteMany({ where }),
    db.invite.deleteMany({ where }),
    db.auditEvent.deleteMany({ where }),
    db.outboxMessage.deleteMany({ where }),
    db.capturedEmail.deleteMany({ where }),
    db.notification.deleteMany({ where }),
    db.pushSubscription.deleteMany({ where }),
    db.notificationTemplate.deleteMany({ where }),
    db.labourRate.deleteMany({ where }),
    db.workOrder.deleteMany({ where }),
    db.checklistTemplate.deleteMany({ where }),
    db.ppmSchedule.deleteMany({ where }),
    db.ppmTaskTemplate.deleteMany({ where }),
    db.serviceRequest.deleteMany({ where }),
    db.requestMailbox.deleteMany({ where }),
    db.requestPriority.deleteMany({ where }),
    db.requestType.deleteMany({ where }),
    db.asset.deleteMany({ where }),
    db.assetClass.deleteMany({ where }),
    db.location.deleteMany({ where }),
    db.membership.deleteMany({ where: { id: { in: visitorMemberships.map((m) => m.id) } } }),
    db.role.deleteMany({ where: { ...where, builtin: false } }),
    db.configVersion.deleteMany({ where }),
    db.fieldDefinition.deleteMany({ where }),
    db.numberSequence.deleteMany({ where }),
  ]);
  const orphans = await db.account.findMany({
    where: { id: { in: visitorAccounts }, memberships: { none: {} } },
    select: { id: true },
  });
  await db.account.deleteMany({ where: { id: { in: orphans.map((a) => a.id) } } });

  for (const id of tenantIds) await seedRoles(db, id, true);
  if (opts.reseed !== false) await seed(db);
  return { tenants: tenantIds.length, removedAccounts: orphans.length };
}
