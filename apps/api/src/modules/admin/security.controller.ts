import { Body, Controller, Get, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { withTenant } from '@cafm/db';
import { updateSecuritySchema, type AuditFilterOptions, type AuditPage, type SecuritySettingsView } from '@cafm/shared';
import { z } from 'zod';
import { audit } from '../../core/audit';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { readSecurity } from '../../core/security-settings';
import { parse } from '../../core/validation';

const PAGE_SIZE = 50;
/** An export is capped so one request can't read the whole table. */
const EXPORT_LIMIT = 5000;

const auditQuerySchema = z.object({
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(100).optional(),
  entityId: z.string().trim().max(100).optional(),
  actorId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().uuid().optional(),
});

type AuditQuery = z.infer<typeof auditQuerySchema>;

/** Quote a CSV cell, and stop a spreadsheet from running text that starts like a formula. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function auditWhere(tenantId: string, q: AuditQuery) {
  return {
    tenantId,
    ...(q.action ? { action: { contains: q.action, mode: 'insensitive' as const } } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.actorId ? { actorAccountId: q.actorId } : {}),
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
  /** The people and record types the audit screen offers in its filters. */
  @Get('audit/filters')
  @RequirePermission('audit.read')
  async auditFilters(@Req() req: Request): Promise<AuditFilterOptions> {
    const tenantId = req.auth!.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const [people, types] = await Promise.all([
        tx.membership.findMany({
          where: { tenantId },
          select: { accountId: true, account: { select: { name: true } } },
          orderBy: { account: { name: 'asc' } },
        }),
        tx.auditEvent.groupBy({ by: ['entityType'], where: { tenantId }, orderBy: { entityType: 'asc' } }),
      ]);
      return {
        people: people.map((p) => ({ id: p.accountId, name: p.account.name })),
        entityTypes: types.map((t) => t.entityType),
      };
    });
  }

  /** The filtered log as CSV, newest first, at most 5,000 rows. The export itself is audited. */
  @Get('audit/export')
  @RequirePermission('audit.read')
  async auditExport(@Req() req: Request, @Res() res: Response, @Query() query: unknown): Promise<void> {
    const tenantId = req.auth!.membership!.tenantId;
    const q = parse(auditQuerySchema, query);
    const { rows, names } = await withTenant(this.db, tenantId, async (tx) => {
      const found = await tx.auditEvent.findMany({
        where: auditWhere(tenantId, q),
        orderBy: { id: 'desc' },
        take: EXPORT_LIMIT,
      });
      const ids = [...new Set(found.map((r) => r.actorAccountId).filter((id): id is string => !!id))];
      const people = ids.length
        ? await tx.membership.findMany({
            where: { tenantId, accountId: { in: ids } },
            select: { accountId: true, account: { select: { name: true } } },
          })
        : [];
      await audit(
        tx,
        req.auth!,
        {
          action: 'audit.exported',
          entityType: 'audit',
          changes: JSON.parse(JSON.stringify({ rows: found.length, filters: { ...q, cursor: undefined } })),
        },
        req.ip,
      );
      return { rows: found, names: new Map(people.map((p) => [p.accountId, p.account.name])) };
    });
    const header = ['When (UTC)', 'Who', 'Event', 'Record type', 'Record id', 'IP', 'Changes'];
    const lines = rows.map((r) =>
      [
        r.createdAt.toISOString(),
        r.actorAccountId ? (names.get(r.actorAccountId) ?? '') : '',
        r.action,
        r.entityType,
        r.entityId,
        r.ip,
        r.changes ? JSON.stringify(r.changes) : '',
      ]
        .map(csvCell)
        .join(','),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send([header.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n');
  }
}
