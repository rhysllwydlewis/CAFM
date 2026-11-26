import { Body, Controller, Get, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { withTenant, type Prisma } from '@fmstead/db';
import { updateSecuritySchema, type AuditActor, type AuditPage, type SecuritySettingsView } from '@fmstead/shared';
import { z } from 'zod';
import { audit } from '../../core/audit';
import { auditCsv } from '../../core/audit-csv';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { readSecurity } from '../../core/security-settings';
import { parse } from '../../core/validation';

const PAGE_SIZE = 50;

/** An export holds at most this many events; a narrower filter or date range gets the rest. */
const EXPORT_LIMIT = 5000;

const auditFilterSchema = z
  .object({
    action: z.string().trim().max(100).optional(),
    entityType: z.string().trim().max(100).optional(),
    /** The record the event is about (its id). */
    entityId: z.string().trim().max(100).optional(),
    /** The membership of the person who acted. */
    actor: z.string().uuid().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'The start date must be before the end date.' });
const auditQuerySchema = auditFilterSchema.and(z.object({ cursor: z.string().uuid().optional() }));

type AuditFilter = z.infer<typeof auditFilterSchema>;

function auditWhere(tenantId: string, q: AuditFilter): Prisma.AuditEventWhereInput {
  return {
    tenantId,
    ...(q.action ? { action: { contains: q.action, mode: 'insensitive' as const } } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.actor ? { actorMembershipId: q.actor } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
}

/** Security settings and the audit log viewer (doc 02, admin). */
@Controller('admin')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class SecurityController {
  constructor(private readonly db: PrismaService) {}

  @Get('security')
  @RequirePermission('settings.manage')
  security(@Req() req: Request): Promise<SecuritySettingsView> {
    return readSecurity(this.db, req.auth!.membership!.tenantId);
  }

  @Put('security')
  @RequirePermission('settings.manage')
  async save(@Req() req: Request, @Body() body: unknown): Promise<SecuritySettingsView> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const data = parse(updateSecuritySchema, body);
    const before = await readSecurity(this.db, tenantId);
    return withTenant(this.db, tenantId, async (tx) => {
      await tx.tenantSecurity.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
      await audit(
        tx,
        auth,
        {
          action: 'settings.security_updated',
          entityType: 'tenant_security',
          changes: { before: { ...before }, after: { ...data } },
        },
        req.ip,
      );
      return data;
    });
  }

  /** Newest first, filtered, 50 at a time. `cursor` is the id of the last row of the previous page. */
  @Get('audit')
  @RequirePermission('audit.read')
  async auditLog(@Req() req: Request, @Query() query: unknown): Promise<AuditPage> {
    const tenantId = req.auth!.membership!.tenantId;
    const q = parse(auditQuerySchema, query);
    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx.auditEvent.findMany({
        where: auditWhere(tenantId, q),
        orderBy: { id: 'desc' },
        take: PAGE_SIZE + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const page = rows.slice(0, PAGE_SIZE);
      const accountIds = [...new Set(page.map((r) => r.actorAccountId).filter((id): id is string => !!id))];
      const people = accountIds.length
        ? await tx.membership.findMany({
            where: { tenantId, accountId: { in: accountIds } },
            select: { accountId: true, account: { select: { name: true } } },
          })
        : [];
      const names = new Map(people.map((p) => [p.accountId, p.account.name]));
      return {
        items: page.map((r) => ({
          id: r.id,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          actor: r.actorAccountId ? (names.get(r.actorAccountId) ?? null) : null,
          ip: r.ip,
          createdAt: r.createdAt.toISOString(),
          changes: r.changes,
        })),
        nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1]!.id : null,
      };
    });
  }
  /** The people who appear in the log, for the "Who" filter. */
  @Get('audit/actors')
  @RequirePermission('audit.read')
  async auditActors(@Req() req: Request): Promise<AuditActor[]> {
    const tenantId = req.auth!.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const groups = await tx.auditEvent.groupBy({
        by: ['actorMembershipId'],
        where: { tenantId, actorMembershipId: { not: null } },
      });
      const ids = groups.map((g) => g.actorMembershipId).filter((id): id is string => !!id);
      const people = await tx.membership.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, account: { select: { name: true } } },
      });
      return people
        .map((p) => ({ membershipId: p.id, name: p.account.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
    });
  }

  /** The same filters as the viewer, as a CSV file of up to 5,000 events. The export is itself recorded. */
  @Get('audit/export')
  @RequirePermission('audit.read')
  async exportAuditLog(
    @Req() req: Request,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const q = parse(auditFilterSchema, query);
    const csv = await withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx.auditEvent.findMany({
        where: auditWhere(tenantId, q),
        orderBy: { id: 'desc' },
        take: EXPORT_LIMIT,
      });
      const accountIds = [...new Set(rows.map((r) => r.actorAccountId).filter((id): id is string => !!id))];
      const people = accountIds.length
        ? await tx.membership.findMany({
            where: { tenantId, accountId: { in: accountIds } },
            select: { accountId: true, account: { select: { name: true } } },
          })
        : [];
      const names = new Map(people.map((p) => [p.accountId, p.account.name]));
      await audit(
        tx,
        auth,
        {
          action: 'audit.exported',
          entityType: 'audit_log',
          changes: {
            filters: {
              ...(q.action ? { action: q.action } : {}),
              ...(q.entityType ? { entityType: q.entityType } : {}),
              ...(q.entityId ? { entityId: q.entityId } : {}),
              ...(q.actor ? { actor: q.actor } : {}),
              ...(q.from ? { from: q.from.toISOString() } : {}),
              ...(q.to ? { to: q.to.toISOString() } : {}),
            },
            rows: rows.length,
          },
        },
        req.ip,
      );
      return auditCsv(
        rows.map((r) => ({ ...r, actor: r.actorAccountId ? (names.get(r.actorAccountId) ?? null) : null })),
      );
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.setHeader('Cache-Control', 'no-store');
    return csv;
  }
}
