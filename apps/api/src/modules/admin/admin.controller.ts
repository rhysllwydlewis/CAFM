import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { scopedLocations, withTenant } from '@cafm/db';
import { shortUsername, type AdminOverview, type AdminUser, type SiteAccessOverview } from '@cafm/shared';
import { administrableMembers, isDelegated } from '../../core/delegation';
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
          tx.auditEvent.groupBy({
            by: ['actorMembershipId'],
            where: { tenantId, createdAt: { gte: since }, NOT: { action: { startsWith: 'auth.' } } },
            _count: { _all: true },
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
        changesLast7Days: { count: changes.reduce((sum, c) => sum + c._count._all, 0), people: changes.length },
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
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    // A role with data scope "own" sees only itself, as in the people list.
    const own = auth.access!.scope === 'own' ? { id: auth.membership!.id } : {};
    return withTenant(this.db, tenantId, async (tx) => {
      // A delegated admin sees themself and the people inside their own sites.
      const allowed = await administrableMembers(tx, auth);
      const [rows, roles, sessions] = await Promise.all([
        tx.membership.findMany({
          where: {
            tenantId,
            // Both limits apply: a delegated admin's sites and a role's own-records scope.
            AND: [own, allowed ? { id: { in: [...allowed, auth.membership!.id] } } : {}],
          },
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
        username: shortUsername(m.account.username),
        title: m.title,
        role: m.role,
        roleLabel: names.get(m.role) ?? m.role,
        licence: m.licence,
        status: m.status as AdminUser['status'],
        lastSignIn: lastSeen.get(m.id)?.toISOString() ?? null,
      }));
    });
  }

  /** Site limits for the people this admin manages, and the areas they can hand out. */
  @Get('site-access')
  @RequirePermission('people.manage')
  async siteAccess(@Req() req: Request): Promise<SiteAccessOverview> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const allowed = await administrableMembers(tx, auth);
      const [areas, members, grants] = await Promise.all([
        tx.location.findMany({
          where: {
            ...scopedLocations(auth.membership!, auth.access?.scope),
            kind: { in: ['region', 'site'] },
            status: { not: 'closed' },
          },
          select: { id: true, name: true, code: true, kind: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take: 500,
        }),
        tx.membership.findMany({
          where: { tenantId, ...(allowed ? { id: { in: [...allowed] } } : {}) },
          select: { id: true, role: true, locationScoped: true },
        }),
        tx.membershipSite.findMany({ where: { tenantId }, select: { membershipId: true, locationId: true } }),
      ]);
      const byMember = new Map<string, string[]>();
      for (const g of grants) byMember.set(g.membershipId, [...(byMember.get(g.membershipId) ?? []), g.locationId]);
      return {
        delegated: isDelegated(auth),
        areas: areas.map((a) => ({ ...a, kind: a.kind as 'region' | 'site' })),
        members: members.map((m) => ({
          membershipId: m.id,
          restricted: m.locationScoped && m.role !== 'super_user',
          locationIds: m.locationScoped ? (byMember.get(m.id) ?? []) : [],
        })),
      };
    });
  }
}
