import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { withTenant } from '@cafm/db';
import { licenceForRole, updateMemberSchema } from '@cafm/shared';
import {
  assertCanGrant,
  assertFullUserSeat,
  assertNotDemoLocked,
  assertNotLastSuperUser,
} from '../../core/access-rules';
import { administrableMembers, assertAdministrable } from '../../core/delegation';
import { audit } from '../../core/audit';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { toCsv } from '../../core/csv';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { visibleMembers } from '../../core/data-scope';

@Controller('people')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class PeopleController {
  constructor(private readonly db: PrismaService) {}

  /**
   * People in the current organisation. RLS scopes the rows to the tenant; the
   * where clause is belt and braces. A role with scope "own" sees only itself, and
   * someone limited to sites sees themself and the people inside their own sites,
   * the same people as on the users screen, so that screen cannot be bypassed here.
   */
  @Get()
  @RequirePermission('people.read')
  async list(@Req() req: Request) {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const own = visibleMembers(auth);
    return withTenant(this.db, tenantId, async (tx) => {
      const allowed = await administrableMembers(tx, auth);
      const [rows, roles] = await Promise.all([
        tx.membership.findMany({
          // Both limits apply: a role's own-records scope and a delegated person's sites.
          where: { tenantId, AND: [own, allowed ? { id: { in: [...allowed, auth.membership!.id] } } : {}] },
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
   * The same people as the list, as a CSV file. It needs people.read and applies the
   * same limits, so nobody sees more here than on the users screen. Audited.
   */
  @Get('export')
  @RequirePermission('people.read')
  async exportCsv(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const own = visibleMembers(auth);
    const csv = await withTenant(this.db, tenantId, async (tx) => {
      const allowed = await administrableMembers(tx, auth);
      const rows = await tx.membership.findMany({
        where: { tenantId, AND: [own, allowed ? { id: { in: [...allowed, auth.membership!.id] } } : {}] },
        include: { account: true },
        orderBy: [{ account: { name: 'asc' } }, { id: 'asc' }],
        take: 5000,
      });
      const out = toCsv(
        ['name', 'email', 'role', 'status'],
        rows.map((m) => [m.account.name, m.account.email, m.role, m.status]),
      );
      await audit(
        tx,
        auth,
        { action: 'people.exported', entityType: 'membership', entityId: tenantId, changes: { rows: rows.length } },
        req.ip,
      );
      return out;
    });
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="people.csv"',
      'Cache-Control': 'no-store',
    });
    return csv;
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
      const target = await tx.membership.findFirst({
        where: { id: membershipId, tenantId: actor.tenantId },
        include: { account: { select: { isDemo: true } } },
      });
      if (!target) throw new NotFoundException();
      await assertAdministrable(tx, auth, target.id);

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

      assertNotDemoLocked(target.account.isDemo);

      const leavesSuperUser =
        target.role === 'super_user' &&
        target.status === 'active' &&
        ((changes.role !== undefined && changes.role !== 'super_user') || changes.status === 'deactivated');
      if (leavesSuperUser) await assertNotLastSuperUser(tx, actor.tenantId);

      // The licence follows the role (doc 07), and a full licence needs a seat on the plan.
      const licence = changes.role !== undefined ? licenceForRole(changes.role) : target.licence;
      const status = changes.status ?? target.status;
      const takesFullSeat =
        licence === 'full' && status === 'active' && !(target.licence === 'full' && target.status === 'active');
      if (takesFullSeat) await assertFullUserSeat(tx, auth.access!, actor.tenantId);

      const updated = await tx.membership.update({ where: { id: target.id }, data: { ...changes, licence } });
      await audit(
        tx,
        auth,
        {
          action: 'membership.updated',
          entityType: 'membership',
          entityId: target.id,
          changes: {
            before: { role: target.role, status: target.status, licence: target.licence },
            after: { role: updated.role, status: updated.status, licence: updated.licence },
          },
        },
        req.ip,
      );
      return updated;
    });

    // A deactivated member is signed out everywhere in this organisation.
    // That includes any "view as" sessions they started, which belong to the person they were viewing.
    if (result.status !== 'active') {
      await this.db.session.deleteMany({
        where: { OR: [{ membershipId: result.id }, { impersonatorMembershipId: result.id }] },
      });
    }
    return { membershipId: result.id, role: result.role, status: result.status };
  }

  /**
   * Resets someone's MFA (doc 06): their authenticator and recovery codes are removed, and they enrol again at their
   * next sign-in. Same guardrails as changing their role: not yourself, and only people you may administer.
   */
  @Post(':membershipId/mfa/reset')
  @HttpCode(200)
  @RequirePermission('people.manage')
  async resetMfa(@Param('membershipId', ParseUUIDPipe) membershipId: string, @Req() req: Request) {
    const auth = req.auth!;
    const actor = auth.membership!;
    if (membershipId === actor.id) throw new ForbiddenException({ code: 'cannot_change_self' });
    const accountId = await withTenant(this.db, actor.tenantId, async (tx) => {
      const target = await tx.membership.findFirst({
        where: { id: membershipId, tenantId: actor.tenantId },
        include: { account: { select: { id: true, isDemo: true } } },
      });
      if (!target) throw new NotFoundException();
      await assertAdministrable(tx, auth, target.id);
      assertNotDemoLocked(target.account.isDemo);
      await audit(
        tx,
        auth,
        { action: 'membership.mfa_reset', entityType: 'membership', entityId: target.id, changes: {} },
        req.ip,
      );
      return target.account.id;
    });
    await this.db.$transaction([
      this.db.accountMfa.deleteMany({ where: { accountId } }),
      this.db.mfaRecoveryCode.deleteMany({ where: { accountId } }),
      this.db.mfaChallenge.deleteMany({ where: { accountId } }),
    ]);
    return { membershipId, mfa: false };
  }
}
