import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Temporal } from '@js-temporal/polyfill';
import { withTenant, type Prisma } from '@fmstead/db';
import {
  AGE_BANDS,
  COST_KINDS,
  reportQuerySchema,
  WORK_ORDER_FINISHED,
  type BusiestSitesReport,
  type CostAnalysisReport,
  type Feature,
  type Permission,
  type SatisfactionReport,
  type OpenJobsByAgeReport,
  type PpmComplianceReport,
  type SlaPerformanceReport,
  type WorkMixReport,
} from '@fmstead/shared';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { requestScope } from '../helpdesk/request-scope';
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
      const open = [
        workOrderScope(auth),
        { status: { notIn: [...WORK_ORDER_FINISHED] } },
        ...(input.locationId ? [{ location: { ancestors: { some: { ancestorId: input.locationId } } } }] : []),
      ];
      // One count per band, so the database does the counting and no job is loaded. A job is in a band by its
      // whole days of age (rounded down), so band n holds ages from the day after the previous band up to its own.
      const counts = await Promise.all(
        AGE_BANDS.map((band, i) => {
          const previous = AGE_BANDS[i - 1]?.maxDays;
          const age = {
            ...(previous != null ? { lte: new Date(now - (previous + 1) * DAY_MS) } : {}),
            ...(band.maxDays !== null ? { gt: new Date(now - (band.maxDays + 1) * DAY_MS) } : {}),
          };
          return tx.workOrder.count({ where: { AND: [...open, { createdAt: age }] } });
        }),
      );
      const total = counts.reduce((sum, n) => sum + n, 0);
      return {
        key: 'open_jobs_by_age',
        generatedAt: new Date(now).toISOString(),
        total,
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

  /** Ratings requesters gave in the period (UK days, default the last 30). Needs the Helpdesk and `requests.manage` too. */
  @Get('satisfaction')
  satisfaction(@Req() req: Request, @Query() query: unknown): Promise<SatisfactionReport> {
    const auth = req.auth!;
    this.require(auth, 'helpdesk', 'requests.manage');
    const input = parse(reportQuerySchema, query);
    const { from, to } = this.period(input);
    return withTenant(this.db, auth.membership!.tenantId, async (tx): Promise<SatisfactionReport> => {
      const groups = await tx.serviceRequest.groupBy({
        by: ['rating'],
        _count: { _all: true },
        where: {
          AND: [
            requestScope(auth, false),
            { rating: { not: null } },
            {
              ratedAt: {
                gte: startOfDay(from),
                lt: startOfDay(Temporal.PlainDate.from(to).add({ days: 1 }).toString()),
              },
            },
            ...(input.locationId ? [{ location: { ancestors: { some: { ancestorId: input.locationId } } } }] : []),
          ],
        },
      });
      const counts = new Map(groups.map((g) => [g.rating, g._count._all]));
      const byRating = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: counts.get(rating) ?? 0 }));
      const rated = byRating.reduce((sum, r) => sum + r.count, 0);
      const points = byRating.reduce((sum, r) => sum + r.rating * r.count, 0);
      return {
        key: 'satisfaction',
        generatedAt: new Date().toISOString(),
        from,
        to,
        rated,
        average: rated ? Math.round((points / rated) * 10) / 10 : null,
        byRating,
      };
    });
  }

  /** Cost entered in the period by the day it was incurred, per currency and kind. Needs `costs.read` and work orders. */
  @Get('cost-analysis')
  costAnalysis(@Req() req: Request, @Query() query: unknown): Promise<CostAnalysisReport> {
    const auth = req.auth!;
    this.require(auth, 'work_orders', 'costs.read');
    const input = parse(reportQuerySchema, query);
    const { from, to } = this.period(input);
    return withTenant(this.db, auth.membership!.tenantId, async (tx): Promise<CostAnalysisReport> => {
      const groups = await tx.workOrderCost.groupBy({
        by: ['kind', 'workOrderId'],
        _sum: { amountMinor: true },
        where: {
          incurredOn: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
          workOrder: {
            AND: [
              workOrderScope(auth),
              ...(input.locationId ? [{ location: { ancestors: { some: { ancestorId: input.locationId } } } }] : []),
            ],
          },
        },
      });
      const jobs = groups.length
        ? await tx.workOrder.findMany({
            where: { id: { in: [...new Set(groups.map((g) => g.workOrderId))] } },
            select: { id: true, currency: true },
          })
        : [];
      const currencyOf = new Map(jobs.map((j) => [j.id, j.currency]));
      const perCurrency = new Map<string, Map<string, number>>();
      for (const g of groups) {
        const currency = currencyOf.get(g.workOrderId);
        if (!currency) continue;
        const kinds = perCurrency.get(currency) ?? new Map<string, number>();
        kinds.set(g.kind, (kinds.get(g.kind) ?? 0) + (g._sum.amountMinor ?? 0));
        perCurrency.set(currency, kinds);
      }
      const currencies = [...perCurrency.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, kinds]) => {
          const byKind = [
            ...COST_KINDS,
            ...[...kinds.keys()].filter((k) => !(COST_KINDS as readonly string[]).includes(k)),
          ]
            .map((kind) => ({ kind, amountMinor: kinds.get(kind) ?? 0 }))
            .filter((row) => COST_KINDS.includes(row.kind as (typeof COST_KINDS)[number]) || row.amountMinor !== 0);
          return { currency, totalMinor: byKind.reduce((sum, r) => sum + r.amountMinor, 0), byKind };
        });
      return { key: 'cost_analysis', generatedAt: new Date().toISOString(), from, to, currencies };
    });
  }

  /** The person's role and plan must allow this report's data as well as `reports.read`. */
  private require(auth: NonNullable<Request['auth']>, feature: Feature, permission: Permission) {
    const access = auth.access;
    if (!access?.entitlements.features.includes(feature) || !access.permissions.has(permission)) {
      throw new ForbiddenException({ code: 'forbidden', message: 'Your role cannot see this report.' });
    }
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
