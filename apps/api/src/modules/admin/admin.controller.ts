import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { withTenant } from '@cafm/db';
import type { AdminOverview, AdminUser } from '@cafm/shared';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Read models for the Super User admin console (P1-09). Changes go through the existing people, roles and settings endpoints. */
@Controller('admin')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class AdminController {
  constructor(private readonly db: PrismaService) {}

  /** Headline numbers and the setup checklist for the admin overview. */
  @Get('overview')
  @RequirePermission('settings.manage')
  async overview(@Req() req: Request): Promise<AdminOverview> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const since = new Date(Date.now() - WEEK_MS);
    return withTenant(this.db, tenantId, async (tx) => {
      const [licences, superUsers, pendingInvites, pendingFullInvites, changes, locations, assets, requestTypes] =
        await Promise.all([
          tx.membership.groupBy({ by: ['licence'], where: { tenantId, status: 'active' }, _count: { _all: true } }),
          tx.membership.count({ where: { tenantId, status: 'active', role: 'super_user' } }),
          tx.invite.count({ where: { tenantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
          tx.invite.count({
            where: { tenantId, licence: 'full', acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          }),
          tx.auditEvent.findMany({
            where: { tenantId, createdAt: { gte: since }, NOT: { action: { startsWith: 'auth.' } } },
            select: { actorMembershipId: true },
          }),
          tx.location.count({ where: { tenantId } }),
          tx.asset.count({ where: { tenantId } }),
          tx.requestType.count({ where: { tenantId } }),
        ]);
      const count = (licence: string) => licences.find((l) => l.licence === licence)?._count._all ?? 0;
      const activeUsers = licences.reduce((sum, l) => sum + l._count._all, 0);
      return {
        organisation: auth.membership!.tenant.name,
        plan: auth.access!.entitlements.plan,
        superUsers,
        activeUsers,
        licences: Object.fromEntries(licences.map((l) => [l.licence, l._count._all])),
        fullSeats: { used: count('full') + pendingFullInvites, limit: auth.access!.entitlements.limits.full_users },
        pendingInvites,
        changesLast7Days: { count: changes.length, people: new Set(changes.map((c) => c.actorMembershipId)).size },
        checklist: [
          {
            key: 'people',
            label: 'Invite your team',
            done: activeUsers + pendingInvites > 1,
            href: '/app/admin/users',
          },
          { key: 'sites', label: 'Add your sites', done: locations > 0, href: '/app/locations' },
          { key: 'assets', label: 'Add your assets', done: assets > 0, href: '/app/assets' },
          {
            key: 'requests',
            label: 'Set up the request catalogue',
            done: requestTypes > 0,
            href: '/app/helpdesk/settings',
          },
          { key: 'superusers', label: 'Have a second Super User', done: superUsers > 1, href: '/app/admin/users' },
        ],
      };
    });
  }

  /** Everyone in the organisation with licence, status and last sign-in. */
  @Get('users')
  @RequirePermission('people.manage')
  async users(@Req() req: Request): Promise<AdminUser[]> {
    const tenantId = req.auth!.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const [rows, roles, sessions] = await Promise.all([
        tx.membership.findMany({
          where: { tenantId },
          include: { account: true },
          orderBy: { account: { name: 'asc' } },
        }),
        tx.role.findMany({ where: { tenantId }, select: { key: true, name: true } }),
        tx.session.groupBy({ by: ['membershipId'], where: { tenantId }, _max: { createdAt: true } }),
      ]);
      const names = new Map(roles.map((r) => [r.key, r.name]));
      const lastSeen = new Map(sessions.map((s) => [s.membershipId, s._max.createdAt]));
      return rows.map((m) => ({
        membershipId: m.id,
        name: m.account.name,
        email: m.account.email,
        username: m.account.username,
        title: m.title,
        role: m.role,
        roleLabel: names.get(m.role) ?? m.role,
        licence: m.licence,
        status: m.status as AdminUser['status'],
        lastSignIn: lastSeen.get(m.id)?.toISOString() ?? null,
      }));
    });
  }
}
