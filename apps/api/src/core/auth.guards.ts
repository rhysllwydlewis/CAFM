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
import { type Permission, roleHas } from '@cafm/shared';
import { PrismaService } from './prisma.service';
import { hashToken, SESSION_COOKIE } from './session';

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
    const membership =
      session.membershipId && session.tenantId
        ? await withTenant(this.db, session.tenantId, (tx) =>
            tx.membership.findFirst({
              where: { id: session.membershipId!, status: 'active', tenant: { status: 'active' } },
              include: { tenant: true },
            }),
          )
        : null;
    req.auth = { session: rest, account, membership };
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
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);

/** Checks the permission registry for the membership's role. Use after TenantGuard. */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.get<Permission | undefined>(PERMISSION_KEY, context.getHandler());
    if (!permission) return true;
    const role = context.switchToHttp().getRequest<Request>().auth?.membership?.role;
    if (!role || !roleHas(role, permission)) throw new ForbiddenException();
    return true;
  }
}
