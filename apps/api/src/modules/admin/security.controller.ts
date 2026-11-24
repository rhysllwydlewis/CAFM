import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { withTenant } from '@cafm/db';
import { updateSecuritySchema, type AuditPage, type SecuritySettingsView } from '@cafm/shared';
import { z } from 'zod';
import { audit } from '../../core/audit';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { readSecurity } from '../../core/security-settings';
import { parse } from '../../core/validation';

const PAGE_SIZE = 50;

const auditQuerySchema = z.object({
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().uuid().optional(),
});

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
        where: {
          tenantId,
          ...(q.action ? { action: { contains: q.action, mode: 'insensitive' as const } } : {}),
          ...(q.entityType ? { entityType: q.entityType } : {}),
          ...(q.from || q.to
            ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
            : {}),
        },
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
}
