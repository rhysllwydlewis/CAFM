import { Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { withAccount, type Account } from '@cafm/db';
import {
  ROLE_LABELS,
  SIGN_IN_FAILED,
  type CurrentUser,
  type LoginRequest,
  type LoginResponse,
  type OrganisationOption,
} from '@cafm/shared';
import { PrismaService } from '../../core/prisma.service';
import { type AuthContext, LONG_SESSION_MS, newSessionToken, SHORT_SESSION_MS } from '../../core/session';

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

  constructor(private readonly db: PrismaService) {}

  async login(input: LoginRequest, client: ClientInfo): Promise<{ response: LoginResponse; session: SessionIssued }> {
    const identifier = input.identifier.toLowerCase();
    const account = await this.db.account.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });

    if (!account) {
      await argon2.verify(await this.dummyHash, input.password);
      await this.event('sign_in_failed', { identifier, ip: client.ip });
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }
    if (account.lockedUntil && account.lockedUntil > new Date()) {
      await this.event('sign_in_locked', { accountId: account.id, ip: client.ip });
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }
    if (!(await argon2.verify(account.passwordHash, input.password))) {
      await this.recordFailure(account, client);
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }

    const organisations = await this.organisations(account.id);
    if (organisations.length === 0) {
      await this.event('sign_in_no_organisation', { accountId: account.id, ip: client.ip });
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }
    await this.db.account.update({ where: { id: account.id }, data: { failedAttempts: 0, lockedUntil: null } });

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
    const persistent = auth.session.expiresAt.getTime() - auth.session.createdAt.getTime() > SHORT_SESSION_MS;
    await this.db.session.delete({ where: { id: auth.session.id } });
    const session = await this.issueSession(auth.account.id, chosen.membershipId, chosen.tenantId, persistent, client);
    await this.event('organisation_selected', { accountId: auth.account.id, tenantId: chosen.tenantId, ip: client.ip });
    return { response: { status: 'signed_in', landingPage: chosen.landingPage } satisfies LoginResponse, session };
  }

  async listOrganisations(accountId: string): Promise<OrganisationOption[]> {
    return (await this.organisations(accountId)).map(toOption);
  }

  async logout(auth: AuthContext, client: ClientInfo): Promise<void> {
    await this.db.session.deleteMany({ where: { id: auth.session.id } });
    await this.event('sign_out', {
      accountId: auth.account.id,
      tenantId: auth.session.tenantId ?? undefined,
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
      tenant: { id: m.tenant.id, name: m.tenant.name, plan: m.tenant.plan },
      role: m.role,
      roleLabel: ROLE_LABELS[m.role] ?? m.role,
      licence: m.licence,
    };
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

  private async issueSession(
    accountId: string,
    membershipId: string | null,
    tenantId: string | null,
    persistent: boolean,
    client: ClientInfo,
  ): Promise<SessionIssued> {
    const { token, tokenHash } = newSessionToken();
    const expiresAt = new Date(Date.now() + (persistent ? LONG_SESSION_MS : SHORT_SESSION_MS));
    await this.db.session.create({
      data: {
        tokenHash,
        accountId,
        membershipId,
        tenantId,
        expiresAt,
        ip: client.ip,
        userAgent: client.userAgent?.slice(0, 512),
      },
    });
    return { token, expiresAt, persistent };
  }

  private async recordFailure(account: Account, client: ClientInfo): Promise<void> {
    const failures = account.failedAttempts + 1;
    // Demo accounts never lock: their password is public, and a lockout would let anyone break the demo.
    const lock = !account.isDemo && failures >= MAX_FAILURES;
    await this.db.account.update({
      where: { id: account.id },
      data: lock ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) } : { failedAttempts: failures },
    });
    await this.event(lock ? 'account_locked' : 'sign_in_failed', { accountId: account.id, ip: client.ip });
  }

  private async event(type: string, data: { accountId?: string; tenantId?: string; identifier?: string; ip?: string }) {
    await this.db.authEvent.create({ data: { type, ...data } });
  }
}

function toOption(o: { membershipId: string; tenantName: string; plan: string; role: string }): OrganisationOption {
  return {
    membershipId: o.membershipId,
    tenantName: o.tenantName,
    plan: o.plan,
    roleLabel: ROLE_LABELS[o.role] ?? o.role,
  };
}
