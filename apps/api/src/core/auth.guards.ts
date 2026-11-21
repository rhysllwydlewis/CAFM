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
import { withTenant } from '@cafm/db';
import { type Feature, type Permission, planFor } from '@cafm/shared';
import { loadAccess } from './access';
import { PrismaService } from './prisma.service';
import { hashToken, SESSION_COOKIE, type Access } from './session';

/** Requires a valid, unexpired session. Attaches req.auth. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly db: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
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
    const tenantData =
      session.membershipId && session.tenantId
        ? await withTenant(this.db, session.tenantId, async (tx) => {
            const membership = await tx.membership.findFirst({
              where: { id: session.membershipId!, status: 'active', tenant: { status: 'active' } },
              include: { tenant: true },
            });
            if (!membership) return null;
            const access = await loadAccess(tx, membership.tenantId, membership.role, membership.tenant.plan);
            return { membership, access };
          })
        : null;
    req.auth = {
      session: rest,
      account,
      membership: tenantData?.membership ?? null,
      access: tenantData?.access ?? null,
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

const PERMISSION_KEY = 'cafm:permission';
const FEATURE_KEY = 'cafm:feature';
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
