import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { withTenant } from '@fmstead/db';
import { type Feature, type Permission, planFor } from '@fmstead/shared';
import { loadAccess } from './access';
import { PrismaService } from './prisma.service';
import { hashToken, SESSION_COOKIE, type Access } from './session';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** What a person who must set up MFA can still reach: the MFA set-up itself, who they are, and signing out. */
const MFA_SETUP_ALLOWED = /^\/api\/auth\/(mfa(\/|$)|me$|logout$|organisations$|select-organisation$)/;
/** What a person who must change their password can still reach: that, the password rules, who they are, signing out. */
const PASSWORD_CHANGE_ALLOWED =
  /^\/api\/auth\/(password$|password-policy$|me$|logout$|organisations$|select-organisation$)/;
export const END_IMPERSONATION_PATH = '/api/admin/impersonation/end';

/** Requires a valid, unexpired session. Attaches req.auth. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly db: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    // The mobile PWA sends an OAuth access token (P1-06a); browsers send the session cookie.
    const bearer = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '')?.[1];
    const token: unknown = bearer ?? req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token) throw new UnauthorizedException();
    const session = await this.db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { account: true },
    });
    if (!session) throw new UnauthorizedException();
    if (session.expiresAt <= new Date()) {
      await this.db.session.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedException();
    }
    const { account, ...rest } = session;
    // "View as" (P1-09c) is read-only: anything that could change data is refused, except ending it.
    const impersonating = !!(session.impersonatorAccountId && session.impersonatorMembershipId);
    if (impersonating && !SAFE_METHODS.has(req.method) && req.originalUrl.split('?')[0] !== END_IMPERSONATION_PATH) {
      throw new ForbiddenException({
        code: 'impersonation_read_only',
        message: 'You are viewing as another person, which is read-only. End it to make changes.',
      });
    }
    const tenantData =
      session.membershipId && session.tenantId
        ? await withTenant(this.db, session.tenantId, async (tx) => {
            const membership = await tx.membership.findFirst({
              where: { id: session.membershipId!, status: 'active', tenant: { status: 'active' } },
              include: { tenant: true },
            });
            if (!membership) return null;
            const access = await loadAccess(tx, membership.tenantId, membership.role, membership.tenant.plan);
            if (impersonating) {
              // The real person must still be active and still allowed to view as others, or the view ends now.
              const real = await tx.membership.findFirst({
                where: { id: session.impersonatorMembershipId!, status: 'active', tenant: { status: 'active' } },
              });
              const realAccess = real && (await loadAccess(tx, real.tenantId, real.role, membership.tenant.plan));
              if (!realAccess?.permissions.has('people.impersonate')) return 'revoked' as const;
            }
            const security = await tx.tenantSecurity.findUnique({ where: { tenantId: membership.tenantId } });
            return { membership, access, mfaRequired: security?.mfaRequired ?? false };
          })
        : null;
    if (tenantData === 'revoked') {
      await this.db.session.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedException();
    }
    // The organisation asks everyone for a second step: until this person has one, only its set-up is open.
    // The shared demo accounts have a public password and can't set one up, and "view as" shows what the other person sees, so neither is held.
    const mfaSetupRequired =
      !!tenantData &&
      tenantData.mfaRequired &&
      !impersonating &&
      !account.isDemo &&
      (await this.db.accountMfa.count({ where: { accountId: account.id, enabledAt: { not: null } } })) === 0;
    // An administrator generated this password, so only changing it is open until the person has chosen their own.
    // The shared demo accounts can't change theirs, and "view as" shows what the other person sees, so neither is held.
    const passwordChangeRequired = account.mustChangePassword && !impersonating && !account.isDemo;
    const path = req.originalUrl.split('?')[0]!;
    // When both are due, the password comes first. Each step opens only its own routes, so applying both checks to
    // one request would leave neither able to finish: while the password is due its routes are open, and the second
    // step's set-up opens once it has been changed.
    if (passwordChangeRequired) {
      if (!PASSWORD_CHANGE_ALLOWED.test(path)) {
        throw new ForbiddenException({
          code: 'password_change_required',
          message: 'An administrator set your password. Choose your own to continue.',
        });
      }
    } else if (mfaSetupRequired && !MFA_SETUP_ALLOWED.test(path)) {
      throw new ForbiddenException({
        code: 'mfa_setup_required',
        message: 'Your organisation requires two-step verification. Set it up to continue.',
      });
    }
    const impersonator = impersonating
      ? await this.db.account.findUnique({ where: { id: session.impersonatorAccountId! }, select: { name: true } })
      : null;
    req.auth = {
      session: rest,
      impersonator: impersonating
        ? {
            accountId: session.impersonatorAccountId!,
            membershipId: session.impersonatorMembershipId!,
            name: impersonator?.name ?? 'A Super User',
          }
        : null,
      account,
      membership: tenantData?.membership ?? null,
      access: tenantData?.access ?? null,
      mfaSetupRequired,
      passwordChangeRequired,
    };
    return true;
  }
}

/** Requires a session that has entered an organisation (tenant). Use after SessionGuard. */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.auth?.membership) throw new ForbiddenException({ code: 'organisation_required' });
    return true;
  }
}

const PERMISSION_KEY = 'fmstead:permission';
const FEATURE_KEY = 'fmstead:feature';
/** The member's role must grant this permission (doc 03). */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);
/** The tenant's plan or add-ons must include this feature (ADR 0006). */
export const RequireFeature = (feature: Feature) => SetMetadata(FEATURE_KEY, feature);

export function assertAccess(access: Access | null | undefined, feature?: Feature, permission?: Permission): void {
  if (feature && !access?.entitlements.features.includes(feature)) {
    throw new ForbiddenException({ code: 'feature_locked', feature, plan: planFor(feature) ?? null });
  }
  if (permission && !access?.permissions.has(permission)) throw new ForbiddenException();
}

/**
 * Checks @RequireFeature then @RequirePermission on the handler or its
 * controller. Use after SessionGuard and TenantGuard.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const access = context.switchToHttp().getRequest<Request>().auth?.access;
    const feature = this.reflector.getAllAndOverride<Feature | undefined>(FEATURE_KEY, targets);
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, targets);
    assertAccess(access, feature, permission);
    return true;
  }
}
