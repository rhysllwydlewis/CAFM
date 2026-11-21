import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant } from '@cafm/db';
import { updateMemberSchema } from '@cafm/shared';
import { assertCanGrant, assertNotLastSuperUser } from '../../core/access-rules';
import { audit } from '../../core/audit';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';

@Controller('people')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class PeopleController {
  constructor(private readonly db: PrismaService) {}

  /**
   * People in the current organisation. RLS scopes the rows to the tenant; the
   * where clause is belt and braces. A role with scope "own" sees only itself.
   */
  @Get()
  @RequirePermission('people.read')
  async list(@Req() req: Request) {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const [rows, roles] = await Promise.all([
        tx.membership.findMany({
          where: { tenantId, ...(auth.access!.scope === 'own' ? { id: auth.membership!.id } : {}) },
          include: { account: true },
          orderBy: { account: { name: 'asc' } },
        }),
        tx.role.findMany({ where: { tenantId }, select: { key: true, name: true } }),
      ]);
      const names = new Map(roles.map((r) => [r.key, r.name]));
      return rows.map((m) => ({
        membershipId: m.id,
        name: m.account.name,
        email: m.account.email,
        role: m.role,
        roleLabel: names.get(m.role) ?? m.role,
        status: m.status,
      }));
    });
  }

  /**
   * Change someone's role or deactivate them (doc 03). Guardrails: not
   * yourself; not someone whose access exceeds yours; no granting beyond what
   * you hold; never the last active Super User.
   */
  @Patch(':membershipId')
  @RequirePermission('people.manage')
  async update(@Param('membershipId', ParseUUIDPipe) membershipId: string, @Body() body: unknown, @Req() req: Request) {
    const changes = parse(updateMemberSchema, body);
    const auth = req.auth!;
    const actor = auth.membership!;
    if (membershipId === actor.id) throw new ForbiddenException({ code: 'cannot_change_self' });

    const result = await withTenant(this.db, actor.tenantId, async (tx) => {
      const target = await tx.membership.findFirst({ where: { id: membershipId, tenantId: actor.tenantId } });
      if (!target) throw new NotFoundException();

      const currentRole = await tx.role.findUnique({
        where: { tenantId_key: { tenantId: actor.tenantId, key: target.role } },
      });
      assertCanGrant(auth.access!, actor.role, currentRole?.permissions ?? []);

      if (changes.role !== undefined && changes.role !== target.role) {
        const newRole = await tx.role.findUnique({
          where: { tenantId_key: { tenantId: actor.tenantId, key: changes.role } },
        });
        if (!newRole) throw new NotFoundException({ code: 'unknown_role' });
        assertCanGrant(auth.access!, actor.role, newRole.permissions);
      }

      const leavesSuperUser =
        target.role === 'super_user' &&
        target.status === 'active' &&
        ((changes.role !== undefined && changes.role !== 'super_user') || changes.status === 'deactivated');
      if (leavesSuperUser) {
        assertNotLastSuperUser(
          await tx.membership.count({ where: { tenantId: actor.tenantId, role: 'super_user', status: 'active' } }),
        );
      }

      const updated = await tx.membership.update({ where: { id: target.id }, data: changes });
      await audit(
        tx,
        auth,
        {
          action: 'membership.updated',
          entityType: 'membership',
          entityId: target.id,
          changes: {
            before: { role: target.role, status: target.status },
            after: { role: updated.role, status: updated.status },
          },
        },
        req.ip,
      );
      return updated;
    });

    // A deactivated member is signed out everywhere in this organisation.
    if (result.status !== 'active') await this.db.session.deleteMany({ where: { membershipId: result.id } });
    return { membershipId: result.id, role: result.role, status: result.status };
  }
}
