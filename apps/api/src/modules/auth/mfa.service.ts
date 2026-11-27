import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import type { Account } from '@fmstead/db';
import { MFA_FAILED, type MfaEnrolment, type MfaStatus, type MfaVerifyInput, SIGN_IN_FAILED } from '@fmstead/shared';
import { PrismaService } from '../../core/prisma.service';
import { hashToken, newSessionToken } from '../../core/session';
import {
  decryptSecret,
  encryptSecret,
  hashRecoveryCode,
  newRecoveryCodes,
  newSecret,
  otpauthUri,
  verifyCode,
} from '../../core/totp';

const CHALLENGE_MS = 5 * 60 * 1000;
const MAX_CHALLENGE_FAILURES = 5;

interface Client {
  ip?: string;
}

@Injectable()
export class MfaService {
  constructor(private readonly db: PrismaService) {}

  async isEnabled(accountId: string): Promise<boolean> {
    return (await this.db.accountMfa.count({ where: { accountId, enabledAt: { not: null } } })) > 0;
  }

  async status(accountId: string): Promise<MfaStatus> {
    return {
      enabled: await this.isEnabled(accountId),
      recoveryCodesLeft: await this.db.mfaRecoveryCode.count({ where: { accountId, usedAt: null } }),
    };
  }

  /** Starts (or restarts, if never confirmed) enrolment. Refused while MFA is already on. */
  async startEnrolment(account: Account): Promise<MfaEnrolment> {
    if (await this.isEnabled(account.id)) throw new ConflictException({ code: 'mfa_already_enabled' });
    const secret = newSecret();
    const secretCipher = encryptSecret(secret);
    await this.db.accountMfa.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id, secretCipher },
      update: { secretCipher, lastStep: 0 },
    });
    return { secret, otpauthUri: otpauthUri(secret, account.email ?? account.username ?? account.name) };
  }

  /** Proves the app works with a first code, turns MFA on and returns the recovery codes once. */
  async confirmEnrolment(account: Account, code: string, client: Client): Promise<string[]> {
    const row = await this.db.accountMfa.findUnique({ where: { accountId: account.id } });
    if (!row || row.enabledAt) throw new ConflictException({ code: 'mfa_not_starting' });
    const step = verifyCode(decryptSecret(row.secretCipher), code, row.lastStep);
    if (step === null) throw new UnauthorizedException(MFA_FAILED);
    await this.db.accountMfa.update({
      where: { accountId: account.id },
      data: { enabledAt: new Date(), lastStep: step },
    });
    const codes = await this.replaceRecoveryCodes(account.id);
    await this.event('mfa_enabled', account.id, client);
    return codes;
  }

  async regenerateRecoveryCodes(account: Account, password: string, client: Client): Promise<string[]> {
    await this.assertPassword(account, password);
    if (!(await this.isEnabled(account.id))) throw new ConflictException({ code: 'mfa_not_enabled' });
    const codes = await this.replaceRecoveryCodes(account.id);
    await this.event('mfa_recovery_codes_regenerated', account.id, client);
    return codes;
  }

  /** Turns MFA off for the person themselves. Needs the password again. */
  async disable(account: Account, password: string, client: Client): Promise<void> {
    await this.assertPassword(account, password);
    await this.remove(account.id);
    await this.event('mfa_disabled', account.id, client);
  }

  /** Removes the authenticator, recovery codes and any pending challenge. */
  async remove(accountId: string): Promise<void> {
    await this.db.$transaction([
      this.db.accountMfa.deleteMany({ where: { accountId } }),
      this.db.mfaRecoveryCode.deleteMany({ where: { accountId } }),
      this.db.mfaChallenge.deleteMany({ where: { accountId } }),
    ]);
  }

  async startChallenge(accountId: string, persistent: boolean): Promise<{ token: string; expiresAt: Date }> {
    const { token, tokenHash } = newSessionToken();
    const expiresAt = new Date(Date.now() + CHALLENGE_MS);
    await this.db.mfaChallenge.deleteMany({ where: { accountId, expiresAt: { lt: new Date() } } });
    await this.db.mfaChallenge.create({ data: { tokenHash, accountId, persistent, expiresAt } });
    return { token, expiresAt };
  }

  /**
   * Checks the second step. On success the challenge is used up and the account is returned. A wrong code counts
   * against the challenge, which ends after five. Returns null for anything wrong, with no hint of what.
   */
  async completeChallenge(
    token: string | undefined,
    input: MfaVerifyInput,
    client: Client,
  ): Promise<{ accountId: string; persistent: boolean } | null> {
    if (!token) return null;
    const challenge = await this.db.mfaChallenge.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!challenge || challenge.expiresAt < new Date()) {
      if (challenge) await this.db.mfaChallenge.deleteMany({ where: { id: challenge.id } });
      return null;
    }
    const ok =
      input.code !== undefined
        ? await this.checkTotp(challenge.accountId, input.code)
        : await this.useRecoveryCode(challenge.accountId, input.recoveryCode!);
    if (!ok) {
      const { failedAttempts } = await this.db.mfaChallenge.update({
        where: { id: challenge.id },
        data: { failedAttempts: { increment: 1 } },
        select: { failedAttempts: true },
      });
      if (failedAttempts >= MAX_CHALLENGE_FAILURES)
        await this.db.mfaChallenge.deleteMany({ where: { id: challenge.id } });
      await this.event('mfa_failed', challenge.accountId, client);
      return null;
    }
    // Single use: if two requests race with the right code, only one deletes the row.
    const used = await this.db.mfaChallenge.deleteMany({ where: { id: challenge.id } });
    if (used.count !== 1) return null;
    await this.event(
      input.recoveryCode !== undefined ? 'mfa_recovery_code_used' : 'mfa_passed',
      challenge.accountId,
      client,
    );
    return { accountId: challenge.accountId, persistent: challenge.persistent };
  }

  private async checkTotp(accountId: string, code: string): Promise<boolean> {
    const row = await this.db.accountMfa.findUnique({ where: { accountId } });
    if (!row?.enabledAt) return false;
    const step = verifyCode(decryptSecret(row.secretCipher), code, row.lastStep);
    if (step === null) return false;
    // The conditional update refuses a second use of the same step, even from a parallel request.
    const moved = await this.db.accountMfa.updateMany({
      where: { accountId, lastStep: { lt: step } },
      data: { lastStep: step },
    });
    return moved.count === 1;
  }

  private async useRecoveryCode(accountId: string, code: string): Promise<boolean> {
    const used = await this.db.mfaRecoveryCode.updateMany({
      where: { accountId, codeHash: hashRecoveryCode(code), usedAt: null },
      data: { usedAt: new Date() },
    });
    return used.count === 1;
  }

  private async replaceRecoveryCodes(accountId: string): Promise<string[]> {
    const codes = newRecoveryCodes();
    await this.db.$transaction([
      this.db.mfaRecoveryCode.deleteMany({ where: { accountId } }),
      this.db.mfaRecoveryCode.createMany({
        data: codes.map((c) => ({ accountId, codeHash: hashRecoveryCode(c) })),
      }),
    ]);
    return codes;
  }

  private async assertPassword(account: Account, password: string): Promise<void> {
    if (!(await argon2.verify(account.passwordHash, password))) throw new UnauthorizedException(SIGN_IN_FAILED);
  }

  private async event(type: string, accountId: string, client: Client): Promise<void> {
    await this.db.authEvent.create({ data: { type, accountId, ip: client.ip } });
  }
}
