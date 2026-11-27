import {
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { newToken, hashToken } from '@fmstead/db';
import { passwordProblem } from '@fmstead/shared';
import type { ClientInfo } from './auth.service';
import { AuthService } from './auth.service';
import { ResetRateLimiter } from './login-rate-limiter';
import { strictestMinLength } from '../../core/security-settings';
import { PrismaService } from '../../core/prisma.service';
import { appUrl, queuePlatformEmail } from '../../core/mail';

const TOKEN_TTL_MS = 30 * 60 * 1000;
export const RESET_REQUESTED =
  'If an account exists for that email or username, we’ve sent it a link to reset the password. The link works for 30 minutes.';

/** Password reset by email (doc 06): single-use token, 30-minute expiry, no account enumeration. */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: AuthService,
    private readonly limits: ResetRateLimiter,
  ) {}

  async request(identifierInput: string, client: ClientInfo): Promise<void> {
    if (this.limits.perIp.isBlocked(client.ip)) {
      throw new HttpException('Too many requests. Wait a few minutes and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.limits.perIp.record(client.ip);
    const identifier = identifierInput.toLowerCase();
    const account = await this.db.account.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });

    // Same response whatever happens below, so nobody can tell which accounts exist.
    // Demo accounts can't reset (doc 06): their password is shared and public.
    if (!account || !account.email || account.isDemo || this.limits.perAccount.isBlocked(account.id)) {
      await this.auth.event('password_reset_ignored', { accountId: account?.id, identifier, ip: client.ip });
      return;
    }
    this.limits.perAccount.record(account.id);

    const { token, tokenHash } = newToken();
    await this.db.$transaction(async (tx) => {
      // A new link replaces any earlier unused one.
      await tx.passwordReset.deleteMany({ where: { accountId: account.id, usedAt: null } });
      await tx.passwordReset.create({
        data: { accountId: account.id, tokenHash, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
      });
      await queuePlatformEmail(tx, {
        to: account.email!,
        subject: 'Reset your FM Stead password',
        text: [
          `Hello ${account.name},`,
          '',
          'Someone asked to reset the password for your FM Stead account. If it was you, open this link within 30 minutes:',
          '',
          `${appUrl()}/reset-password/${token}`,
          '',
          'If it wasn’t you, ignore this email: your password hasn’t changed.',
        ].join('\n'),
      });
    });
    await this.auth.event('password_reset_requested', { accountId: account.id, ip: client.ip });
  }

  /** Whether a reset link is still usable, for the reset page. */
  async check(token: string): Promise<{ valid: boolean }> {
    const reset = await this.db.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
    return { valid: !!reset && !reset.usedAt && reset.expiresAt > new Date() };
  }

  async confirm(token: string, password: string, client: ClientInfo): Promise<void> {
    const reset = await this.db.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { account: true },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
      throw new GoneException({
        code: 'reset_link_invalid',
        message: 'This link has expired or has already been used. Ask for a new one.',
      });
    }
    if (reset.account.isDemo) throw new ForbiddenException({ code: 'demo_account' });
    const problem = passwordProblem(password, reset.account.email, await strictestMinLength(this.db, reset.accountId));
    if (problem) throw new UnprocessableEntityException({ code: 'weak_password', message: problem });

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.db.$transaction(async (tx) => {
      // Claim the link: only one request can mark it used, so two at once can't both set a password.
      const claimed = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new GoneException({
          code: 'reset_link_invalid',
          message: 'This link has expired or has already been used. Ask for a new one.',
        });
      }
      await tx.passwordReset.deleteMany({ where: { accountId: reset.accountId, usedAt: null } });
      await tx.account.update({
        where: { id: reset.accountId },
        data: { passwordHash, failedAttempts: 0, lockedUntil: null },
      });
      // A pending second sign-in step began with the old password, so it ends too.
      await tx.mfaChallenge.deleteMany({ where: { accountId: reset.accountId } });
      // A new password signs the account out everywhere.
      await tx.session.deleteMany({
        where: { OR: [{ accountId: reset.accountId }, { impersonatorAccountId: reset.accountId }] },
      });
    });
    await this.auth.event('password_reset', { accountId: reset.accountId, ip: client.ip });
  }
}
