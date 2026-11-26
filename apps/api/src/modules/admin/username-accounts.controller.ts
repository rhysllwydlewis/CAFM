import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import type { Request } from 'express';
import { withTenant } from '@fmstead/db';
import {
  licenceForRole,
  passwordProblem,
  scopedUsername,
  shortUsername,
  usernameAccountCreateSchema,
  type UsernameAccountCredentials,
} from '@fmstead/shared';
import { assertCanGrant, assertFullUserSeat, assertNotDemoLocked } from '../../core/access-rules';
import { assertAdministrable, assertNotDelegated } from '../../core/delegation';
import { audit } from '../../core/audit';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { readSecurity } from '../../core/security-settings';
import { parse } from '../../core/validation';

// No 0/O, 1/l/I: the password is read out or typed from a printed note.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A random password that meets the organisation's policy. Shown to the administrator once. */
export function temporaryPassword(minLength: number): string {
  const length = Math.max(16, minLength);
  for (;;) {
    const password = Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    if (!passwordProblem(password, null, minLength)) return password;
  }
}

/**
 * Username-only accounts for staff without email (doc 03, doc 06). An
 * administrator creates the account and later resets its password; there is
 * no email, so the password is shown once and the person signs in at the
 * organisation's own address (`/t/<organisation>/login`).
 */
@Controller('admin/username-accounts')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class UsernameAccountsController {
  constructor(private readonly db: PrismaService) {}

  @Post()
  @RequirePermission('people.manage')
  async create(@Body() body: unknown, @Req() req: Request): Promise<UsernameAccountCredentials> {
    const input = parse(usernameAccountCreateSchema, body);
    const auth = req.auth!;
    // Like an invitation, a new account carries no site, so only organisation-wide admins make one.
    assertNotDelegated(auth);
    const membership = auth.membership!;
    const tenantId = membership.tenantId;
    const slug = membership.tenant.slug;
    const stored = scopedUsername(input.username, slug);
    const minLength = (await readSecurity(this.db, tenantId)).passwordMinLength;
    const password = temporaryPassword(minLength);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const created = await withTenant(this.db, tenantId, async (tx) => {
      const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: input.role } } });
      if (!role) throw new NotFoundException({ code: 'unknown_role' });
      assertCanGrant(auth.access!, membership.role, role.permissions);
      const licence = licenceForRole(role.key);
      if (licence === 'full') await assertFullUserSeat(tx, auth.access!, tenantId);
      if (await tx.account.findUnique({ where: { username: stored }, select: { id: true } })) {
        throw new ConflictException({ code: 'username_taken', message: 'That username is already in use.' });
      }
      const account = await tx.account
        .create({ data: { username: stored, name: input.name, passwordHash } })
        .catch((error: unknown) => {
          // Two requests for the same name at once: the unique index decides, and the loser is told so.
          if ((error as { code?: string }).code === 'P2002') {
            throw new ConflictException({ code: 'username_taken', message: 'That username is already in use.' });
          }
          throw error;
        });
      const member = await tx.membership.create({
        data: { tenantId, accountId: account.id, role: role.key, licence },
      });
      await audit(
        tx,
        auth,
        {
          action: 'username_account.created',
          entityType: 'membership',
          entityId: member.id,
          changes: { after: { username: input.username, role: role.key } },
        },
        req.ip,
      );
      return member;
    });
    return {
      membershipId: created.id,
      name: input.name,
      username: input.username,
      signInPath: `/t/${slug}/login`,
      temporaryPassword: password,
    };
  }

  /** Sets a new password, signs the person out everywhere and clears any lockout. */
  @Post(':membershipId/reset-password')
  @HttpCode(200)
  @RequirePermission('people.manage')
  async reset(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Req() req: Request,
  ): Promise<UsernameAccountCredentials> {
    const auth = req.auth!;
    const actor = auth.membership!;
    const tenantId = actor.tenantId;
    const minLength = (await readSecurity(this.db, tenantId)).passwordMinLength;
    const password = temporaryPassword(minLength);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const target = await withTenant(this.db, tenantId, async (tx) => {
      const member = await tx.membership.findFirst({
        where: { id: membershipId, tenantId },
        include: { account: true },
      });
      if (!member) throw new NotFoundException();
      await assertAdministrable(tx, auth, member.id);
      if (member.id === actor.id) throw new ForbiddenException({ code: 'cannot_change_self' });
      // Only accounts without an email: everyone else resets their own password from the link in an email.
      if (member.account.email || !member.account.username) {
        throw new ConflictException({
          code: 'not_username_account',
          message: 'This person has an email address, so they reset their own password.',
        });
      }
      assertNotDemoLocked(member.account.isDemo);
      const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: member.role } } });
      assertCanGrant(auth.access!, actor.role, role?.permissions ?? []);
      // An account in more than one organisation is not this organisation's to reset.
      // Memberships of other organisations are hidden from a tenant-only context, so add the account's own.
      await tx.$queryRaw`SELECT set_config('app.account_id', ${member.accountId}, true)`;
      if ((await tx.membership.count({ where: { accountId: member.accountId } })) > 1) {
        throw new ConflictException({
          code: 'shared_account',
          message: 'This account belongs to more than one organisation.',
        });
      }
      await tx.account.update({
        where: { id: member.accountId },
        data: { passwordHash, failedAttempts: 0, lockedUntil: null },
      });
      await audit(
        tx,
        auth,
        { action: 'username_account.password_reset', entityType: 'membership', entityId: member.id },
        req.ip,
      );
      return member;
    });
    await this.db.session.deleteMany({ where: { accountId: target.accountId } });
    // A phone signed in earlier would otherwise renew itself with its refresh token.
    await this.db.mobileDevice.updateMany({
      where: { accountId: target.accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return {
      membershipId: target.id,
      name: target.account.name,
      username: shortUsername(target.account.username)!,
      signInPath: `/t/${actor.tenant.slug}/login`,
      temporaryPassword: password,
    };
  }
}
