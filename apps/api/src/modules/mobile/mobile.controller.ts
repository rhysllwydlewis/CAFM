import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Tx } from '@cafm/db';
import { mobileMutationsSchema } from '@cafm/shared';
import { z } from 'zod';
import type { AuthContext } from '../../core/session';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { MobileMutations } from './mobile-mutations';
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
  // Meters let a technician record a reading offline. Only people who may record readings are sent them.
  const assetIds = [...new Set(rows.flatMap((row) => (row.asset ? [row.asset.id] : [])))];
  const meters =
    assetIds.length && auth.access?.permissions.has('assets.record_readings')
      ? await tx.assetMeter.findMany({
          where: { tenantId, assetId: { in: assetIds } },
          select: { id: true, assetId: true, name: true, unit: true, rolloverAt: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        })
      : [];
  return Promise.all(
    rows.map(async (row) => ({
      ...workOrderSummary(row as never),
      version: row.version,
      description: row.description,
      scheduledFor: row.scheduledFor?.toISOString().slice(0, 10) ?? null,
      accessNotes: row.location.restrictedAccess,
      assetDetail: row.asset
        ? {
            make: row.asset.make,
            model: row.asset.model,
            serial: row.asset.serial,
            meters: meters
              .filter((meter) => meter.assetId === row.asset!.id)
              .map((meter) => ({
                id: meter.id,
                name: meter.name,
                unit: meter.unit,
                rolloverAt: meter.rolloverAt?.toString() ?? null,
              })),
          }
        : null,
      checklists: await readChecklists(tx, tenantId, row.id),
    })),
  );
}

/** What a technician's phone keeps for working offline: their jobs with everything needed to do them. */
@Controller('mobile')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('mobile')
export class MobileController {
  constructor(
    private readonly db: PrismaService,
    private readonly mutations: MobileMutations,
  ) {}

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

  /**
   * Applies a batch of changes made offline, in order. Each has a key made on the phone: a retry with the
   * same key is answered from the first outcome and never repeated. A change that can't be applied (the job
   * changed, the checklist gate holds it back, no permission) is rejected on its own and the rest carry on.
   */
  @Post('mutations')
  @RequirePermission('work_orders.read')
  async mutate(@Req() req: Request, @Body() body: unknown) {
    const { mutations } = parse(mobileMutationsSchema, body);
    return { results: await this.mutations.apply(req.auth!, req.ip, mutations) };
  }
}
