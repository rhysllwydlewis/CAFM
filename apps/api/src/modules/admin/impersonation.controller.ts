import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { withTenant } from '@cafm/db';
import { startImpersonationSchema } from '@cafm/shared';
import { loadAccess } from '../../core/access';
import { audit } from '../../core/audit';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { clientInfo, cookieOptions, setSessionCookie } from '../../core/cookies';
import { administrableMembers } from '../../core/delegation';
import { PrismaService } from '../../core/prisma.service';
import { sessionLifetimeMs } from '../../core/security-settings';
import { newSessionToken, SESSION_COOKIE } from '../../core/session';
import { parse } from '../../core/validation';

/** A "view as" session is short and is never extended. */
export const IMPERSONATION_MS = 60 * 60 * 1000;

/**
 * "View as user" (doc 03, P1-09c). A Super User troubleshoots by seeing the app as someone else sees it.
 * The session is read-only (SessionGuard refuses anything but safe requests), lasts an hour, can't be
 * nested, and both ends are audited under the real person.
 */
@Controller('admin/impersonation')
@UseGuards(SessionGuard, TenantGuard)
export class ImpersonationController {
  constructor(private readonly db: PrismaService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission('people.impersonate')
  async start(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ): Promise<{ landingPage: string }> {
    const auth = req.auth!;
    const input = parse(startImpersonationSchema, body);
    const me = auth.membership!;
    const tenantId = me.tenantId;
    const client = clientInfo(req);
    if (auth.impersonator) throw new ForbiddenException({ code: 'already_impersonating' });
    if (input.membershipId === me.id) {
      throw new ForbiddenException({ code: 'impersonation_self', message: 'You are already signed in as yourself.' });
    }

    const { token, tokenHash } = newSessionToken();
    const expiresAt = new Date(Date.now() + IMPERSONATION_MS);
    const landingPage = await withTenant(this.db, tenantId, async (tx) => {
      // RLS keeps this to the current organisation: another organisation's member is simply not found.
      const target = await tx.membership.findFirst({
        where: { id: input.membershipId, tenantId, status: 'active' },
        include: { account: true },
      });
      if (!target) throw new NotFoundException();
      const allowed = await administrableMembers(tx, auth);
      if (allowed && !allowed.has(target.id)) throw new NotFoundException();
      if (target.role === 'super_user') {
        throw new ForbiddenException({ code: 'impersonation_denied', message: "You can't view as a Super User." });
      }
      // No privilege escalation: you can only see what you could see yourself.
      const theirs = await loadAccess(tx, tenantId, target.role, me.tenant.plan);
      const extra = [...theirs.permissions].filter((p) => !auth.access!.permissions.has(p));
      if (extra.length) {
        throw new ForbiddenException({
          code: 'impersonation_denied',
          message: 'That person has permissions you do not hold.',
        });
      }
      await tx.session.create({
        data: {
          tokenHash,
          accountId: target.accountId,
          membershipId: target.id,
          tenantId,
          expiresAt,
          ip: client.ip,
          userAgent: client.userAgent?.slice(0, 512),
          impersonatorAccountId: auth.account.id,
          impersonatorMembershipId: me.id,
        },
      });
      await audit(
        tx,
        auth,
        {
          action: 'impersonation.started',
          entityType: 'membership',
          entityId: target.id,
          changes: { target: target.account.name, reason: input.reason, expiresAt: expiresAt.toISOString() },
        },
        client.ip,
      );
      return target.landingPage;
    });
    // The real session is replaced, so the token a person holds always matches who they are acting as.
    await this.db.session.deleteMany({ where: { id: auth.session.id } });
    setSessionCookie(res, { token, expiresAt, persistent: false });
    return { landingPage };
  }

  /** Back to your own session. Open to the viewing session itself, which is otherwise read-only. */
  @Post('end')
  @HttpCode(200)
  async end(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ landingPage: string }> {
    const auth = req.auth!;
    if (!auth.impersonator) throw new ForbiddenException({ code: 'not_impersonating' });
    const tenantId = auth.membership!.tenantId;
    const client = clientInfo(req);
    const { token, tokenHash } = newSessionToken();
    const expiresAt = new Date(Date.now() + (await sessionLifetimeMs(this.db, tenantId, false)));
    const own = await withTenant(this.db, tenantId, async (tx) => {
      await audit(
        tx,
        auth,
        {
          action: 'impersonation.ended',
          entityType: 'membership',
          entityId: auth.membership!.id,
          changes: { target: auth.account.name },
        },
        client.ip,
      );
      // If the Super User has since been deactivated or demoted, they are signed out, not restored.
      const membership = await tx.membership.findFirst({
        where: { id: auth.impersonator!.membershipId, status: 'active', tenant: { status: 'active' } },
      });
      if (!membership) return null;
      const access = await loadAccess(tx, tenantId, membership.role, auth.membership!.tenant.plan);
      return access.permissions.has('people.impersonate') ? membership : null;
    });
    await this.db.session.deleteMany({ where: { id: auth.session.id } });
    if (!own) {
      res.clearCookie(SESSION_COOKIE, cookieOptions());
      throw new UnauthorizedException();
    }
    await this.db.session.create({
      data: {
        tokenHash,
        accountId: own.accountId,
        membershipId: own.id,
        tenantId,
        expiresAt,
        ip: client.ip,
        userAgent: client.userAgent?.slice(0, 512),
      },
    });
    setSessionCookie(res, { token, expiresAt, persistent: false });
    return { landingPage: '/app/admin/users' };
  }
}
