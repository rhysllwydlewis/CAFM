import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { withTenant } from '@cafm/db';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';

/** The organisation's audit log, newest first (doc 03 § Security & governance). */
@Controller('audit')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class AuditController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('audit.read')
  async list(@Req() req: Request, @Query('limit') limit?: string) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const tenantId = req.auth!.membership!.tenantId;
    return withTenant(this.db, tenantId, (tx) =>
      tx.auditEvent.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take }),
    );
  }
}
