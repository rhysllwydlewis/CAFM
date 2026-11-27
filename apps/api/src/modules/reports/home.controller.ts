import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Temporal } from '@js-temporal/polyfill';
import { withTenant } from '@cafm/db';
import { WORK_ORDER_FINISHED, type Feature, type HomeSummary, type Permission } from '@cafm/shared';
import type { Access } from '../../core/session';
import { PermissionGuard, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { requestScope } from '../helpdesk/request-scope';
import { workOrderScope } from '../work-orders/work-order-scope';
import { dataScope } from '../../core/data-scope';

const LONDON = 'Europe/London';
const startOfDay = (day: string) => new Date(Temporal.PlainDate.from(day).toZonedDateTime(LONDON).epochMilliseconds);
const OPEN_REQUEST = { status: { in: ['new', 'assigned', 'in_progress'] } };

/**
 * The home page's key figures. There is no single permission to require: each block follows its own
 * permission and feature, so a technician gets their own jobs and finance gets spend, from the same call.
 */
@Controller('home')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class HomeController {
  constructor(private readonly db: PrismaService) {}

  @Get('summary')
  summary(@Req() req: Request): Promise<HomeSummary> {
    const auth = req.auth!;
    const access = auth.access;
    const allowed = (feature: Feature, permission: Permission) => has(access, feature, permission);
    const seesJobs = allowed('work_orders', 'work_orders.read');
    const seesRequests = allowed('helpdesk', 'requests.manage');
    const seesSpend = seesJobs && allowed('work_orders', 'costs.read');
    const today = Temporal.Now.plainDateISO(LONDON);
    const dayStart = startOfDay(today.toString());
    const dayEnd = startOfDay(today.add({ days: 1 }).toString());
    const from = today.subtract({ days: 29 }).toString();
    const now = new Date();
    return withTenant(this.db, auth.membership!.tenantId, async (tx): Promise<HomeSummary> => {
      const open = [workOrderScope(auth), { status: { notIn: [...WORK_ORDER_FINISHED] } }];
      const jobs = seesJobs
        ? await Promise.all([
            tx.workOrder.count({ where: { AND: open } }),
            // A job whose clock is stopped by a pause is not running late (same rule as the work order list).
            tx.workOrder.count({ where: { AND: [...open, { slaPausedAt: null, fixDueAt: { lt: now } }] } }),
            tx.workOrder.count({ where: { AND: [...open, { fixDueAt: { gte: dayStart, lt: dayEnd } }] } }),
            // Same meaning as the work order list: logged and not yet picked up by a person or a contractor.
            tx.workOrder.count({ where: { AND: [workOrderScope(auth), { status: 'logged' }] } }),
          ]).then(([count, overdue, dueToday, unassigned]) => ({
            own: dataScope(auth) === 'own',
            open: count,
            overdue,
            dueToday,
            unassigned,
          }))
        : null;
      const requests = seesRequests
        ? await Promise.all([
            tx.serviceRequest.count({ where: { AND: [requestScope(auth, false), { status: 'new' }] } }),
            tx.serviceRequest.count({
              where: {
                AND: [requestScope(auth, false), OPEN_REQUEST, { firstResponseAt: null, responseDueAt: { lt: now } }],
              },
            }),
          ]).then(([count, responseOverdue]) => ({ new: count, responseOverdue }))
        : null;
      let spend: HomeSummary['spend'] = null;
      if (seesSpend) {
        const incurredOn = { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${today.toString()}T00:00:00Z`) };
        const currencies = await tx.workOrder.groupBy({ by: ['currency'], where: workOrderScope(auth) });
        const totals = await Promise.all(
          currencies.map(async ({ currency }) => {
            const sum = await tx.workOrderCost.aggregate({
              _sum: { amountMinor: true },
              where: { incurredOn, workOrder: { AND: [workOrderScope(auth), { currency }] } },
            });
            return { currency, amountMinor: sum._sum.amountMinor ?? 0 };
          }),
        );
        // Over the limit now: total cost against the job's current limit, not the flag set when a cost was added.
        const limited = await tx.workOrder.findMany({
          where: { AND: [workOrderScope(auth), { nteMinor: { not: null } }] },
          select: { id: true, nteMinor: true },
        });
        const sums = limited.length
          ? await tx.workOrderCost.groupBy({
              by: ['workOrderId'],
              where: { workOrderId: { in: limited.map((j) => j.id) } },
              _sum: { amountMinor: true },
            })
          : [];
        const spent = new Map(sums.map((r) => [r.workOrderId, r._sum.amountMinor ?? 0]));
        const overLimitJobs = limited.filter((j) => (spent.get(j.id) ?? 0) > j.nteMinor!).length;
        spend = {
          from,
          to: today.toString(),
          totals: totals.filter((t) => t.amountMinor > 0).sort((a, b) => a.currency.localeCompare(b.currency)),
          overLimitJobs,
        };
      }
      return { generatedAt: now.toISOString(), jobs, requests, spend };
    });
  }
}

function has(access: Access | null | undefined, feature: Feature, permission: Permission): boolean {
  return !!access?.entitlements.features.includes(feature) && access.permissions.has(permission);
}
