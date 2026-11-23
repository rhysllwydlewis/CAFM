import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Tx } from '@cafm/db';
import { z } from 'zod';
import type { AuthContext } from '../../core/session';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { readChecklists } from '../work-orders/work-order-checklists';
import { workOrderScope } from '../work-orders/work-order-scope';
import { workOrderRelations, workOrderSummary } from '../work-orders/work-order-records';

/** Jobs that are still being worked. Closed and cancelled jobs drop out of the pack. */
const ACTIVE = { notIn: ['closed', 'cancelled'] };
/** The most jobs a pack holds, so a phone is never sent an unbounded list. */
export const WORK_PACK_LIMIT = 200;

const changesQuery = z.object({ since: z.string().min(1).max(64) });

/** A sync token is the server's clock when the pack was read. It says nothing the client can use but to send it back. */
const tokenFor = (at: Date) => at.toISOString();
function readToken(value: string): Date {
  const at = new Date(value);
  if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 60_000) {
    throw new BadRequestException({
      code: 'invalid_sync_token',
      message: 'The sync token is not valid. Fetch the work pack again.',
    });
  }
  return at;
}

async function packJobs(tx: Tx, auth: AuthContext, changedSince: Date | null) {
  const tenantId = auth.membership!.tenantId;
  const base = { ...workOrderScope(auth), status: ACTIVE };
  const where = changedSince
    ? {
        ...base,
        OR: [
          { updatedAt: { gt: changedSince } },
          { checklists: { some: { createdAt: { gt: changedSince } } } },
          { checklists: { some: { items: { some: { answeredAt: { gt: changedSince } } } } } },
        ],
      }
    : base;
  const rows = await tx.workOrder.findMany({
    where,
    include: {
      ...workOrderRelations,
      asset: {
        select: { id: true, name: true, number: true, locationId: true, make: true, model: true, serial: true },
      },
      location: { select: { id: true, name: true, code: true, restrictedAccess: true } },
    },
    orderBy: [{ priority: 'asc' }, { scheduledFor: 'asc' }, { id: 'asc' }],
    take: WORK_PACK_LIMIT,
  });
  return Promise.all(
    rows.map(async (row) => ({
      ...workOrderSummary(row as never),
      version: row.version,
      description: row.description,
      scheduledFor: row.scheduledFor?.toISOString().slice(0, 10) ?? null,
      accessNotes: row.location.restrictedAccess,
      assetDetail: row.asset ? { make: row.asset.make, model: row.asset.model, serial: row.asset.serial } : null,
      checklists: await readChecklists(tx, tenantId, row.id),
    })),
  );
}

/** What a technician's phone keeps for working offline: their jobs with everything needed to do them. */
@Controller('mobile')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('mobile')
export class MobileController {
  constructor(private readonly db: PrismaService) {}

  /** The whole pack: the jobs the person may see that are still open, and a token to ask for changes since. */
  @Get('work-pack')
  @RequirePermission('work_orders.read')
  workPack(@Req() req: Request) {
    const auth = req.auth!;
    const at = new Date();
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => ({
      syncToken: tokenFor(at),
      generatedAt: at.toISOString(),
      limit: WORK_PACK_LIMIT,
      jobs: await packJobs(tx, auth, null),
    }));
  }

  /**
   * Jobs that changed since a token, and the ids of every job the person still has, so the phone can
   * drop the ones that were closed, cancelled or reassigned.
   */
  @Get('changes')
  @RequirePermission('work_orders.read')
  changes(@Req() req: Request, @Query() query: unknown) {
    const auth = req.auth!;
    const { since } = parse(changesQuery, query);
    const sinceAt = readToken(since);
    const at = new Date();
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const jobs = await packJobs(tx, auth, sinceAt);
      const current = await tx.workOrder.findMany({
        where: { ...workOrderScope(auth), status: ACTIVE },
        select: { id: true },
        orderBy: [{ priority: 'asc' }, { scheduledFor: 'asc' }, { id: 'asc' }],
        take: WORK_PACK_LIMIT,
      });
      return { syncToken: tokenFor(at), generatedAt: at.toISOString(), jobs, jobIds: current.map((job) => job.id) };
    });
  }
}
