import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { withTenant } from '@cafm/db';
import { roleLabel } from '@cafm/shared';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';

@Controller('people')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class PeopleController {
  constructor(private readonly db: PrismaService) {}

  /** People in the current organisation. RLS scopes the rows; the where clause is belt and braces. */
  @Get()
  @RequirePermission('people.read')
  async list(@Req() req: Request) {
    const tenantId = req.auth!.membership!.tenantId;
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx.membership.findMany({
        where: { tenantId },
        include: { account: true },
        orderBy: { account: { name: 'asc' } },
      }),
    );
    return rows.map((m) => ({
      membershipId: m.id,
      name: m.account.name,
      email: m.account.email,
      role: m.role,
      roleLabel: roleLabel(m.role),
      status: m.status,
    }));
  }
}
