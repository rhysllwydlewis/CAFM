import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { withAccount, type Account } from '@fmstead/db';
import {
  readPreferences,
  roleLabel,
  scopedUsername,
  SIGN_IN_FAILED,
  TOO_MANY_ATTEMPTS,
  type AccountPreferences,
  type CurrentUser,
  type LoginRequest,
  type LoginResponse,
  type OrganisationOption,
} from '@fmstead/shared';
import { demoLocked } from '../../core/access-rules';
import { PrismaService } from '../../core/prisma.service';
import { sessionLifetimeMs } from '../../core/security-settings';
import { type AuthContext, hashToken, newSessionToken } from '../../core/session';
import { LoginRateLimiter } from './login-rate-limiter';

const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export interface SessionIssued {
  token: string;
  expiresAt: Date;
  persistent: boolean;
}

@Injectable()
export class AuthService {
  /** Verified against when the account doesn't exist, so timing doesn't reveal which emails are registered. */
  private readonly dummyHash = argon2.hash('not-a-real-password', { type: argon2.argon2id });

  constructor(
    private readonly db: PrismaService,
    private readonly limiter: LoginRateLimiter,
  ) {}

  /**
   * Checks the password and issues a new session. Any session the browser
   * already had is ended, so a sign-in always starts from a fresh token.
   */
  async login(
    input: LoginRequest,
    client: ClientInfo,
    previousToken?: string,
  ): Promise<{ response: LoginResponse; session: SessionIssued }> {
    if (this.limiter.isBlocked(client.ip)) {
      await this.event('sign_in_rate_limited', { ip: client.ip });
      throw new HttpException(TOO_MANY_ATTEMPTS, HttpStatus.TOO_MANY_REQUESTS);
    }
    const identifier = input.identifier.toLowerCase();
    // On an organisation's own sign-in page a short username is looked up inside that organisation only.
    const lookup =
      input.organisation && !identifier.includes('@') ? scopedUsername(identifier, input.organisation) : identifier;
    const account = await this.db.account.findFirst({
      where: { OR: [{ email: lookup }, { username: lookup }] },
    });

    if (!account) {
      await argon2.verify(await this.dummyHash, input.password);
      this.limiter.recordFailure(client.ip);
      await this.event('sign_in_failed', { identifier, ip: client.ip });
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }
    if (account.lockedUntil && account.lockedUntil > new Date()) {
      this.limiter.recordFailure(client.ip);
      await this.event('sign_in_locked', { accountId: account.id, ip: client.ip });
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }
    if (!(await argon2.verify(account.passwordHash, input.password))) {
      this.limiter.recordFailure(client.ip);
      await this.recordFailure(account, client);
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }

    const organisations = await this.organisations(account.id);
    if (organisations.length === 0) {
      await this.event('sign_in_no_organisation', { accountId: account.id, ip: client.ip });
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }
    await this.db.account.update({ where: { id: account.id }, data: { failedAttempts: 0, lockedUntil: null } });
    if (previousToken) await this.db.session.deleteMany({ where: { tokenHash: hashToken(previousToken) } });

    const only = organisations.length === 1 ? organisations[0] : undefined;
    const session = await this.issueSession(
      account.id,
      only?.membershipId ?? null,
      only?.tenantId ?? null,
      input.keepSignedIn,
      client,
    );
    await this.event('sign_in', { accountId: account.id, tenantId: only?.tenantId, ip: client.ip });

    const response: LoginResponse = only
      ? { status: 'signed_in', landingPage: only.landingPage }
      : { status: 'choose_organisation', organisations: organisations.map(toOption) };
    return { response, session };
  }

  /** Enters an organisation. Rotates the session so the token changes on privilege change. */
  async selectOrganisation(auth: AuthContext, membershipId: string, client: ClientInfo) {
    const chosen = (await this.organisations(auth.account.id)).find((o) => o.membershipId === membershipId);
    if (!chosen) throw new UnauthorizedException();
    const persistent = auth.session.persistent;
    await this.db.session.delete({ where: { id: auth.session.id } });
    const session = await this.issueSession(auth.account.id, chosen.membershipId, chosen.tenantId, persistent, client);
    await this.event('organisation_selected', { accountId: auth.account.id, tenantId: chosen.tenantId, ip: client.ip });
    return { response: { status: 'signed_in', landingPage: chosen.landingPage } satisfies LoginResponse, session };
  }

  async listOrganisations(accountId: string): Promise<OrganisationOption[]> {
    return (await this.organisations(accountId)).map(toOption);
  }

  /** Ends the session for this token, if there is one. Safe to call with an expired or unknown token. */
  async logout(token: string | undefined, client: ClientInfo): Promise<void> {
    if (!token) return;
    const session = await this.db.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!session) return;
    await this.db.session.deleteMany({ where: { id: session.id } });
    await this.event('sign_out', {
      accountId: session.accountId,
      tenantId: session.tenantId ?? undefined,
      ip: client.ip,
    });
  }

  currentUser(auth: AuthContext): CurrentUser | null {
    const m = auth.membership;
    if (!m) return null;
    return {
      accountId: auth.account.id,
      name: auth.account.name,
      email: auth.account.email,
      membershipId: m.id,
      tenant: { id: m.tenant.id, name: m.tenant.name, plan: m.tenant.plan, demo: m.tenant.demo },
      role: m.role,
      roleLabel: auth.access?.roleName ?? roleLabel(m.role),
      licence: m.licence,
      permissions: [...(auth.access?.permissions ?? [])].sort(),
      scope: auth.access?.scope ?? 'own',
      entitlements: auth.access?.entitlements ?? { plan: m.tenant.plan, features: [], limits: {} },
      impersonation: auth.impersonator
        ? { by: auth.impersonator.name, expiresAt: auth.session.expiresAt.toISOString() }
        : null,
      // A shared demo persona never has saved choices: visitors would hand them on to each other. Anything stored
      // there (from before this rule) is ignored too.
      preferences: demoLocked(auth.account.isDemo) ? {} : readPreferences(auth.account.preferences),
      preferencesLocked: demoLocked(auth.account.isDemo),
    };
  }

  /** Merges a change into the person's own saved choices and returns them all. */
  async updatePreferences(accountId: string, change: AccountPreferences): Promise<AccountPreferences> {
    // One statement, so two quick changes from two tabs can't overwrite each other's keys.
    const rows = await this.db.$queryRaw<{ preferences: unknown }[]>`
      UPDATE account SET preferences = preferences || ${JSON.stringify(change)}::jsonb
      WHERE id = ${accountId}::uuid RETURNING preferences`;
    return readPreferences(rows[0]?.preferences);
  }

  private async organisations(accountId: string) {
    const rows = await withAccount(this.db, accountId, (tx) =>
      tx.membership.findMany({
        where: { accountId, status: 'active', tenant: { status: 'active' } },
        include: { tenant: true },
        orderBy: { tenant: { name: 'asc' } },
      }),
    );
    return rows.map((m) => ({
      membershipId: m.id,
      tenantId: m.tenantId,
      tenantName: m.tenant.name,
      plan: m.tenant.plan,
      role: m.role,
      landingPage: m.landingPage,
    }));
  }

  async issueSession(
    accountId: string,
    membershipId: string | null,
    tenantId: string | null,
    persistent: boolean,
    client: ClientInfo,
  ): Promise<SessionIssued> {
    const { token, tokenHash } = newSessionToken();
    const expiresAt = new Date(Date.now() + (await sessionLifetimeMs(this.db, tenantId, persistent)));
    await this.db.session.create({
      data: {
        tokenHash,
        accountId,
        membershipId,
        tenantId,
        expiresAt,
        persistent,
        ip: client.ip,
        userAgent: client.userAgent?.slice(0, 512),
      },
    });
    return { token, expiresAt, persistent };
  }

  private async recordFailure(account: Account, client: ClientInfo): Promise<void> {
    // Atomic increment, so parallel attempts can't slip past the limit.
    const { failedAttempts } = await this.db.account.update({
      where: { id: account.id },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    // Demo accounts never lock: their password is public, and a lockout would let anyone break the demo.
    const lock = !account.isDemo && failedAttempts >= MAX_FAILURES;
    if (lock) {
      await this.db.account.update({
        where: { id: account.id },
        data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
      });
    }
    await this.event(lock ? 'account_locked' : 'sign_in_failed', { accountId: account.id, ip: client.ip });
  }

  async event(type: string, data: { accountId?: string; tenantId?: string; identifier?: string; ip?: string }) {
    await this.db.authEvent.create({ data: { type, ...data } });
  }
}

function toOption(o: { membershipId: string; tenantName: string; plan: string; role: string }): OrganisationOption {
  return {
    membershipId: o.membershipId,
    tenantName: o.tenantName,
    plan: o.plan,
    roleLabel: roleLabel(o.role),
  };
}
