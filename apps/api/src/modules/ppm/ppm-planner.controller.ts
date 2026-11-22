import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { hasAllLocationAccess, JOB_LICENCES, PPM_TIME_ZONE, withTenant, type Prisma, type Tx } from '@cafm/db';
import {
  addDays,
  addMonths,
  daysBetween,
  localDate,
  PPM_CRITICALITIES,
  PPM_CRITICALITY_LABELS,
  weekStart,
  WORK_ORDER_FINISHED,
  type PpmAssigneeOption,
  type PpmComplianceGroup,
  type PpmCriticality,
  type PpmForecast,
  type PpmFrequency,
  type PpmOverdueItem,
  type PpmPlanner,
  type PpmPlannerRow,
  type PpmSummary,
  type PpmWeekCounts,
} from '@cafm/shared';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { parse } from '../../core/validation';
import { assetScope } from '../assets/asset-scope';
import { today as londonToday } from './ppm-records';
import { compliance, loadVisits, type VisitSchedule } from './ppm-visits';

const memberLabel = { select: { account: { select: { name: true } } } } as const;
const dayOf = (value: Date) => value.toISOString().slice(0, 10);
const londonDay = (instant: Date) => localDate(instant, PPM_TIME_ZONE);

const filters = z.object({
  q: z.string().trim().max(100).optional(),
  criticality: z.enum(PPM_CRITICALITIES).optional(),
  discipline: z.string().trim().max(60).optional(),
});

/** The active schedules this person can see: all of them, or those with an asset on their sites. */
async function activeSchedules(tx: Tx, auth: AuthContext, filter: z.infer<typeof filters> = {}) {
  const tenantId = auth.membership!.tenantId;
  const where: Prisma.PpmScheduleWhereInput = {
    tenantId,
    active: true,
    ...(filter.criticality ? { criticality: filter.criticality } : {}),
    ...(filter.discipline ? { discipline: filter.discipline } : {}),
    AND: [
      ...(filter.q
        ? [
            {
              OR: [
                { title: { contains: filter.q, mode: 'insensitive' as const } },
                { number: { contains: filter.q, mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
      ...(hasAllLocationAccess(auth.membership!, auth.access?.scope)
        ? []
        : [{ rows: { some: { active: true, asset: assetScope(auth) } } }]),
    ],
  };
  return tx.ppmSchedule.findMany({ where, include: { assignee: memberLabel }, orderBy: [{ number: 'asc' }] });
}

type ScheduleRow = Awaited<ReturnType<typeof activeSchedules>>[number];
const visitSchedule = (schedule: ScheduleRow): VisitSchedule => schedule;

const frequencyOf = (schedule: ScheduleRow): PpmFrequency =>
  schedule.freqType === 'meter'
    ? { type: 'meter', meterName: schedule.meterName!, interval: schedule.meterInterval!.toString() }
    : { type: 'calendar', unit: schedule.calendarUnit as 'day', interval: schedule.interval! };

const emptyWeek = (): PpmWeekCounts => ({ scheduled: 0, due: 0, overdue: 0, completed: 0 });

const groupLabel = (key: string, labels?: Record<string, string>) => labels?.[key] ?? key;

@Controller('ppm')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('ppm')
export class PpmPlannerController {
  constructor(private readonly db: PrismaService) {}

  /** The numbers at the top of the planner. */
  @Get('summary')
  @RequirePermission('ppm.read')
  summary(@Req() req: Request): Promise<PpmSummary> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const today = londonToday();
      const schedules = await activeSchedules(tx, auth);
      const monday = weekStart(today);
      const week = (await loadVisits(tx, auth, schedules.map(visitSchedule), monday, addDays(monday, 6), today)).filter(
        (visit) => visit.date >= monday && visit.state !== 'completed',
      );

      const scope = { tenantId, type: 'ppm', ppmScheduleAssetId: { not: null }, asset: assetScope(auth) };
      const [overdueJobs, history] = await Promise.all([
        tx.workOrder.findMany({
          where: {
            ...scope,
            status: { notIn: [...WORK_ORDER_FINISHED] },
            scheduledFor: { lt: new Date(today + 'T00:00:00Z') },
          },
          select: { ppmScheduleAsset: { select: { schedule: { select: { criticality: true } } } } },
        }),
        tx.workOrder.findMany({
          where: {
            ...scope,
            status: { not: 'cancelled' },
            scheduledFor: { gt: new Date(addDays(today, -730) + 'T00:00:00Z'), lte: new Date(today + 'T00:00:00Z') },
          },
          select: {
            status: true,
            scheduledFor: true,
            completedAt: true,
            ppmScheduleAsset: { select: { schedule: { select: { criticality: true, discipline: true } } } },
          },
        }),
      ]);

      const cutoff = addDays(today, -365);
      const current = history.filter((job) => dayOf(job.scheduledFor!) > cutoff);
      const previous = history.filter((job) => dayOf(job.scheduledFor!) <= cutoff);
      const rows = (jobs: typeof history) =>
        jobs.map((job) => ({ status: job.status, scheduledFor: job.scheduledFor!, completedAt: job.completedAt }));
      const groups = (pick: (job: (typeof history)[number]) => string, labels?: Record<string, string>) => {
        const keys = [...new Set(current.map(pick))].sort();
        return keys.map((key): PpmComplianceGroup => ({
          key,
          label: groupLabel(key, labels),
          ...compliance(rows(current.filter((job) => pick(job) === key)), today, londonDay),
        }));
      };
      const byCriticality = groups(
        (job) => job.ppmScheduleAsset?.schedule.criticality ?? 'optimal',
        PPM_CRITICALITY_LABELS,
      );
      // Statutory first, then by how much the law cares.
      byCriticality.sort(
        (a, b) =>
          PPM_CRITICALITIES.indexOf(a.key as PpmCriticality) - PPM_CRITICALITIES.indexOf(b.key as PpmCriticality),
      );
      return {
        schedules: schedules.length,
        dueThisWeek: week.length,
        dueThisWeekUnassigned: week.filter((visit) => !visit.assigned).length,
        overdue: overdueJobs.length,
        overdueStatutory: overdueJobs.filter((job) => job.ppmScheduleAsset?.schedule.criticality === 'statutory')
          .length,
        compliance: compliance(rows(current), today, londonDay),
        previousCompliance: compliance(rows(previous), today, londonDay),
        byCriticality,
        byDiscipline: groups((job) => job.ppmScheduleAsset?.schedule.discipline ?? 'Not set'),
        disciplines: [
          ...new Set(schedules.flatMap((schedule) => (schedule.discipline ? [schedule.discipline] : []))),
        ].sort(),
      };
    });
  }

  /** Each schedule against the weeks ahead, with what is still to come, raised, late and done. */
  @Get('planner')
  @RequirePermission('ppm.read')
  planner(@Req() req: Request, @Query() query: unknown): Promise<PpmPlanner> {
    const input = parse(
      filters
        .extend({
          from: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          weeks: z.coerce.number().int().min(1).max(104).default(52),
        })
        .strict(),
      query,
    );
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const today = londonToday();
      const start = weekStart(input.from ?? today);
      const end = addDays(start, input.weeks * 7 - 1);
      const schedules = await activeSchedules(tx, auth, input);
      const counts = await tx.ppmScheduleAsset.groupBy({
        by: ['scheduleId'],
        where: {
          tenantId: auth.membership!.tenantId,
          active: true,
          scheduleId: { in: schedules.map((schedule) => schedule.id) },
          asset: assetScope(auth),
        },
        _count: true,
      });
      const assetCounts = new Map(counts.map((row) => [row.scheduleId, row._count]));
      const visits = await loadVisits(tx, auth, schedules.map(visitSchedule), start, end, today);

      const totals = Array.from({ length: input.weeks }, emptyWeek);
      const byRow = new Map(
        schedules.map((schedule): [string, PpmPlannerRow] => [
          schedule.id,
          {
            id: schedule.id,
            number: schedule.number,
            title: schedule.title,
            criticality: schedule.criticality as PpmCriticality,
            discipline: schedule.discipline,
            assets: assetCounts.get(schedule.id) ?? 0,
            assigneeName: schedule.assignee?.account.name ?? null,
            frequency: frequencyOf(schedule),
            weeks: {},
          },
        ]),
      );
      for (const visit of visits) {
        // Late and not yet done from before the window is shown in the first week, so it isn't lost off the edge.
        // Anything else before the window (a window that starts in the future) is not part of it.
        if (visit.date < start && visit.state !== 'overdue') continue;
        const index = Math.max(0, Math.floor(daysBetween(start, visit.date) / 7));
        if (index >= input.weeks) continue;
        const row = byRow.get(visit.scheduleId);
        if (!row) continue;
        const cell = (row.weeks[index] ??= emptyWeek());
        cell[visit.state] += 1;
        totals[index]![visit.state] += 1;
      }
      return {
        today,
        weekStarts: Array.from({ length: input.weeks }, (_, index) => addDays(start, index * 7)),
        rows: [...byRow.values()],
        totals,
        meterSchedules: schedules.filter((schedule) => schedule.freqType === 'meter').length,
      };
    });
  }

  /** Visits to come by month, with the labour they need and, for people who can see costs, what they cost. */
  @Get('forecast')
  @RequirePermission('ppm.read')
  forecast(@Req() req: Request, @Query() query: unknown): Promise<PpmForecast> {
    const input = parse(z.object({ months: z.coerce.number().int().min(1).max(36).default(12) }).strict(), query);
    const auth = req.auth!;
    const seesCosts = !!auth.access?.permissions.has('costs.read');
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const today = londonToday();
      const first = today.slice(0, 8) + '01';
      const end = addDays(addMonths(first, input.months), -1);
      const schedules = await activeSchedules(tx, auth);
      const byId = new Map(schedules.map((schedule) => [schedule.id, schedule]));
      const visits = (await loadVisits(tx, auth, schedules.map(visitSchedule), today, end, today)).filter(
        (visit) => (visit.state === 'scheduled' || visit.state === 'due') && visit.date >= today,
      );
      const months = Array.from({ length: input.months }, (_, index) => ({
        month: addMonths(first, index).slice(0, 7),
        visits: 0,
        labourMinutes: 0,
        costMinor: seesCosts ? 0 : null,
        uncosted: 0,
      }));
      for (const visit of visits) {
        const month = months.find((candidate) => candidate.month === visit.date.slice(0, 7));
        const schedule = byId.get(visit.scheduleId);
        if (!month || !schedule) continue;
        month.visits += 1;
        month.labourMinutes += schedule.durationMinutes;
        // Whether a visit has an estimate is itself a cost detail, so it is only counted for people who can see costs.
        if (seesCosts) {
          if (schedule.estimatedCostMinor === null) month.uncosted += 1;
          else month.costMinor! += schedule.estimatedCostMinor;
        }
      }
      return {
        months,
        currency: 'GBP',
        meterSchedules: schedules.filter((schedule) => schedule.freqType === 'meter').length,
      };
    });
  }

  /** Visits raised and not done whose day has passed: statutory first, then the longest overdue. */
  @Get('overdue')
  @RequirePermission('ppm.read')
  overdue(@Req() req: Request): Promise<PpmOverdueItem[]> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const today = londonToday();
      const jobs = await tx.workOrder.findMany({
        where: {
          tenantId,
          type: 'ppm',
          ppmScheduleAssetId: { not: null },
          asset: assetScope(auth),
          status: { notIn: [...WORK_ORDER_FINISHED] },
          scheduledFor: { lt: new Date(today + 'T00:00:00Z') },
        },
        include: {
          assignee: memberLabel,
          location: { select: { name: true } },
          asset: { select: { id: true, number: true, name: true } },
          ppmScheduleAsset: { select: { schedule: { select: { id: true, number: true, criticality: true } } } },
        },
        orderBy: [{ scheduledFor: 'asc' }, { number: 'asc' }],
        take: 500,
      });
      return jobs
        .map((job): PpmOverdueItem => ({
          jobId: job.id,
          number: job.number,
          title: job.title,
          status: job.status,
          scheduleId: job.ppmScheduleAsset!.schedule.id,
          scheduleNumber: job.ppmScheduleAsset!.schedule.number,
          criticality: job.ppmScheduleAsset!.schedule.criticality as PpmCriticality,
          asset: job.asset,
          location: job.location.name,
          dueOn: dayOf(job.scheduledFor!),
          daysLate: daysBetween(dayOf(job.scheduledFor!), today),
          assigneeName: job.assignee?.account.name ?? null,
        }))
        .sort(
          (a, b) =>
            PPM_CRITICALITIES.indexOf(a.criticality) - PPM_CRITICALITIES.indexOf(b.criticality) ||
            b.daysLate - a.daysLate ||
            a.number.localeCompare(b.number),
        );
    });
  }

  /** The people a schedule can be given to: active, licensed for field work, in a role that works on jobs. */
  @Get('assignees')
  @RequirePermission('ppm.manage')
  assignees(@Req() req: Request): Promise<PpmAssigneeOption[]> {
    const { tenantId } = req.auth!.membership!;
    return withTenant(this.db, tenantId, async (tx) => {
      const [members, roles] = await Promise.all([
        tx.membership.findMany({
          where: { tenantId, status: 'active', licence: { in: [...JOB_LICENCES] } },
          select: { id: true, role: true, account: { select: { name: true } } },
        }),
        tx.role.findMany({ where: { tenantId }, select: { key: true, name: true, permissions: true } }),
      ]);
      const works = new Map(
        roles
          .filter(
            (role) =>
              role.permissions.includes('work_orders.read') &&
              (role.permissions.includes('work_orders.close') || role.permissions.includes('work_orders.edit')),
          )
          .map((role) => [role.key, role.name]),
      );
      return members
        .filter((member) => works.has(member.role))
        .map((member) => ({ id: member.id, name: member.account.name, role: works.get(member.role)! }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    });
  }
}
