import { Controller, Get, Query, Req, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Temporal } from '@js-temporal/polyfill';
import { withTenant, type Prisma } from '@cafm/db';
import {
  AGE_BANDS,
  reportQuerySchema,
  WORK_ORDER_FINISHED,
  type BusiestSitesReport,
  type OpenJobsByAgeReport,
  type PpmComplianceReport,
  type SlaPerformanceReport,
  type WorkMixReport,
} from '@cafm/shared';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { locationScope } from '../locations/location-tree';
import { workOrderScope } from '../work-orders/work-order-scope';

const DAY_MS = 86_400_000;
const LONDON = 'Europe/London';
const startOfDay = (day: string) => new Date(Temporal.PlainDate.from(day).toZonedDateTime(LONDON).epochMilliseconds);

/** Standard reports. Each is a fixed query over the jobs the person may already see (their sites and own-work scope). */
@Controller('reports')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('reports')
@RequirePermission('reports.read')
export class ReportsController {
  constructor(private readonly db: PrismaService) {}

  @Get('open-jobs-by-age')
  openJobsByAge(@Req() req: Request, @Query() query: unknown): Promise<OpenJobsByAgeReport> {
    const auth = req.auth!;
    const input = parse(reportQuerySchema, query);
    const now = Date.now();
    return withTenant(this.db, auth.membership!.tenantId, async (tx): Promise<OpenJobsByAgeReport> => {
      const rows = await tx.workOrder.findMany({
        where: {
          AND: [
            workOrderScope(auth),
            { status: { notIn: [...WORK_ORDER_FINISHED] } },
            ...(input.locationId ? [{ location: { ancestors: { some: { ancestorId: input.locationId } } } }] : []),
          ],
        },
        select: { createdAt: true },
      });
      const counts = AGE_BANDS.map(() => 0);
      for (const { createdAt } of rows) {
        const days = Math.floor((now - createdAt.getTime()) / DAY_MS);
        const index = AGE_BANDS.findIndex((band) => band.maxDays === null || days <= band.maxDays);
        counts[index] = (counts[index] ?? 0) + 1;
      }
      return {
        key: 'open_jobs_by_age',
        generatedAt: new Date(now).toISOString(),
        total: rows.length,
        bands: AGE_BANDS.map((band, i) => ({ key: band.key, label: band.label, count: counts[i] ?? 0 })),
      };
    });
  }

  @Get('sla-performance')
  slaPerformance(@Req() req: Request, @Query() query: unknown): Promise<SlaPerformanceReport> {
    const auth = req.auth!;
    const input = parse(reportQuerySchema, query);
    const today = Temporal.Now.plainDateISO(LONDON);
    const to = input.to ?? today.toString();
    const from = input.from ?? Temporal.PlainDate.from(to).subtract({ days: 29 }).toString();
    if (from > to) throw new UnprocessableEntityException('The start date must not be after the end date.');
    return withTenant(this.db, auth.membership!.tenantId, async (tx): Promise<SlaPerformanceReport> => {
      const where: Prisma.WorkOrderWhereInput = {
        AND: [
          workOrderScope(auth),
          {
            completedAt: {
              gte: startOfDay(from),
              lt: startOfDay(Temporal.PlainDate.from(to).add({ days: 1 }).toString()),
            },
          },
          { fixDueAt: { not: null } },
          ...(input.locationId ? [{ location: { ancestors: { some: { ancestorId: input.locationId } } } }] : []),
        ],
      };
      const rows = await tx.workOrder.findMany({
        where,
        select: { priority: true, completedAt: true, fixDueAt: true },
      });
      const byPriority = new Map<number, { measured: number; met: number }>();
      let met = 0;
      for (const row of rows) {
        const ok = row.completedAt!.getTime() <= row.fixDueAt!.getTime();
        const entry = byPriority.get(row.priority) ?? { measured: 0, met: 0 };
        entry.measured += 1;
        if (ok) {
          entry.met += 1;
          met += 1;
        }
        byPriority.set(row.priority, entry);
      }
      return {
        key: 'sla_performance',
        generatedAt: new Date().toISOString(),
        from,
        to,
        measured: rows.length,
        met,
        breached: rows.length - met,
        percentMet: rows.length ? Math.round((met / rows.length) * 100) : null,
        byPriority: [...byPriority.entries()].sort(([a], [b]) => a - b).map(([priority, v]) => ({ priority, ...v })),
      };
    });
  }

  /** PPM visits due in the period (UK days, default the last 30 days): done on time, done late, overdue or still to come. */
  @Get('ppm-compliance')
  ppmCompliance(@Req() req: Request, @Query() query: unknown): Promise<PpmComplianceReport> {
    const auth = req.auth!;
    const input = parse(reportQuerySchema, query);
    const today = Temporal.Now.plainDateISO(LONDON);
    const to = input.to ?? today.toString();
    const from = input.from ?? Temporal.PlainDate.from(to).subtract({ days: 29 }).toString();
    if (from > to) throw new UnprocessableEntityException('The start date must not be after the end date.');
    return withTenant(this.db, auth.membership!.tenantId, async (tx): Promise<PpmComplianceReport> => {
      const rows = await tx.workOrder.findMany({
        where: {
          AND: [
            workOrderScope(auth),
            { type: 'ppm', status: { not: 'cancelled' } },
            { scheduledFor: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
            ...(input.locationId ? [{ location: { ancestors: { some: { ancestorId: input.locationId } } } }] : []),
          ],
        },
        select: { scheduledFor: true, completedAt: true },
      });
      let onTime = 0;
      let late = 0;
      let overdue = 0;
      let upcoming = 0;
      const todayText = today.toString();
      for (const row of rows) {
        const dueDay = row.scheduledFor!.toISOString().slice(0, 10);
        if (row.completedAt) {
          const doneDay = Temporal.Instant.fromEpochMilliseconds(row.completedAt.getTime())
            .toZonedDateTimeISO(LONDON)
            .toPlainDate()
            .toString();
          if (doneDay <= dueDay) onTime += 1;
          else late += 1;
        } else if (dueDay < todayText) overdue += 1;
        else upcoming += 1;
      }
      const passed = onTime + late + overdue;
      return {
        key: 'ppm_compliance',
        generatedAt: new Date().toISOString(),
        from,
        to,
        due: rows.length,
        onTime,
        late,
        overdue,
        upcoming,
        percentOnTime: passed ? Math.round((onTime / passed) * 100) : null,
      };
    });
  }

  /** Jobs raised in the period (UK days, default the last 30 days), reactive against planned. */
  @Get('work-mix')
  workMix(@Req() req: Request, @Query() query: unknown): Promise<WorkMixReport> {
    const auth = req.auth!;
    const input = parse(reportQuerySchema, query);
    const { from, to } = this.period(input);
    return withTenant(this.db, auth.membership!.tenantId, async (tx): Promise<WorkMixReport> => {
      const groups = await tx.workOrder.groupBy({
        by: ['type'],
        _count: { _all: true },
        where: this.raisedIn(auth, input.locationId, from, to),
      });
      let reactive = 0;
      let planned = 0;
      for (const group of groups) {
        if (group.type === 'ppm') planned += group._count._all;
        else reactive += group._count._all;
      }
      const total = reactive + planned;
      return {
        key: 'work_mix',
        generatedAt: new Date().toISOString(),
        from,
        to,
        total,
        reactive,
        planned,
        percentReactive: total ? Math.round((reactive / total) * 100) : null,
      };
    });
  }

  /** The five sites with the most jobs raised in the period. */
  @Get('busiest-sites')
  busiestSites(@Req() req: Request, @Query() query: unknown): Promise<BusiestSitesReport> {
    const auth = req.auth!;
    const input = parse(reportQuerySchema, query);
    const { from, to } = this.period(input);
    return withTenant(this.db, auth.membership!.tenantId, async (tx): Promise<BusiestSitesReport> => {
      const rows = await tx.workOrder.groupBy({
        by: ['locationId'],
        _count: { _all: true },
        where: this.raisedIn(auth, input.locationId, from, to),
      });
      const perPlace = new Map<string, number>(rows.map((row) => [row.locationId, row._count._all]));
      const paths = perPlace.size
        ? await tx.locationPath.findMany({
            where: {
              descendantId: { in: [...perPlace.keys()] },
              ancestor: { kind: 'site', AND: [locationScope(auth)] },
            },
            select: { ancestorId: true, descendantId: true, ancestor: { select: { name: true } } },
          })
        : [];
      const perSite = new Map<string, { name: string; jobs: number }>();
      for (const path of paths) {
        const entry = perSite.get(path.ancestorId) ?? { name: path.ancestor.name, jobs: 0 };
        entry.jobs += perPlace.get(path.descendantId) ?? 0;
        perSite.set(path.ancestorId, entry);
      }
      const sites = [...perSite.entries()]
        .map(([locationId, v]) => ({ locationId, ...v }))
        .sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name))
        .slice(0, 5);
      return { key: 'busiest_sites', generatedAt: new Date().toISOString(), from, to, sites };
    });
  }

  /** The period as UK days: the query's own, or the last 30 days. */
  private period(input: { from?: string; to?: string }) {
    const to = input.to ?? Temporal.Now.plainDateISO(LONDON).toString();
    const from = input.from ?? Temporal.PlainDate.from(to).subtract({ days: 29 }).toString();
    if (from > to) throw new UnprocessableEntityException('The start date must not be after the end date.');
    return { from, to };
  }

  /** Jobs the person may see that were raised in the UK-day period, optionally below one place. */
  private raisedIn(auth: NonNullable<Request['auth']>, locationId: string | undefined, from: string, to: string) {
    return {
      AND: [
        workOrderScope(auth),
        {
          createdAt: {
            gte: startOfDay(from),
            lt: startOfDay(Temporal.PlainDate.from(to).add({ days: 1 }).toString()),
          },
        },
        ...(locationId ? [{ location: { ancestors: { some: { ancestorId: locationId } } } }] : []),
      ],
    } satisfies Prisma.WorkOrderWhereInput;
  }
}
