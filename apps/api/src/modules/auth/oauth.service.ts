import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { withAccount } from '@fmstead/db';
import {
  MOBILE_ACCESS_TOKEN_SECONDS,
  MOBILE_AUTH_CODE_SECONDS,
  MOBILE_DEVICE_LIMIT,
  MOBILE_REFRESH_GRACE_SECONDS,
  type MobileDeviceSummary,
  type OauthAuthorizeRequest,
  type OauthTokenRequest,
  type OauthTokenResponse,
} from '@fmstead/shared';
import { PrismaService } from '../../core/prisma.service';
import { type AuthContext, hashToken, newSessionToken } from '../../core/session';
import { LoginRateLimiter } from './login-rate-limiter';
import type { ClientInfo } from './auth.service';

/** Refresh tokens last 30 days from their last use. */
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

const invalidGrant = () => new BadRequestException({ error: 'invalid_grant' });

/**
 * OAuth 2.0 authorisation-code flow with PKCE (S256) for the mobile PWA (ADR 0005,
 * doc 04). A signed-in browser session approves a device and gets a 60-second
 * single-use code. The device swaps it, with its secret verifier, for a
 * 15-minute access token and a rotating refresh token. Access tokens are
 * ordinary session rows tied to the device, so every guard works unchanged.
 */
@Injectable()
export class OauthService {
  constructor(
    private readonly db: PrismaService,
    private readonly limiter: LoginRateLimiter,
  ) {}

  async authorize(auth: AuthContext, input: OauthAuthorizeRequest): Promise<{ code: string; expires_in: number }> {
    if (!auth.membership) throw new BadRequestException({ error: 'organisation_required' });
    // A device token can't mint more devices; only a person at a browser can approve one.
    if (auth.session.deviceId) throw new BadRequestException({ error: 'access_denied' });
    // An approval code lives for a minute and is deleted when used, so any that remain are expired. Clear them here so
    // the table stays small without a separate job.
    await this.db.oauthCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const { token, tokenHash } = newSessionToken();
    await this.db.oauthCode.create({
      data: {
        codeHash: tokenHash,
        codeChallenge: input.code_challenge,
        accountId: auth.account.id,
        membershipId: auth.membership.id,
        deviceName: input.device_name,
        expiresAt: new Date(Date.now() + MOBILE_AUTH_CODE_SECONDS * 1000),
      },
    });
    return { code: token, expires_in: MOBILE_AUTH_CODE_SECONDS };
  }

  async token(input: OauthTokenRequest, client: ClientInfo): Promise<OauthTokenResponse> {
    if (this.limiter.isBlocked(client.ip)) throw new BadRequestException({ error: 'slow_down' });
    try {
      return input.grant_type === 'authorization_code'
        ? await this.exchangeCode(input.code, input.code_verifier, client)
        : await this.refresh(input.refresh_token, client);
    } catch (e) {
      this.limiter.recordFailure(client.ip);
      throw e;
    }
  }

  /** Revokes the device that holds this refresh token. Always succeeds (RFC 7009), so tokens can't be probed. */
  async revoke(token: string): Promise<void> {
    const device = await this.db.mobileDevice.findUnique({ where: { refreshHash: hashToken(token) } });
    if (device) await this.revokeDevice(device.id, device.accountId, 'mobile_device_signed_out');
  }

  async listDevices(auth: AuthContext): Promise<MobileDeviceSummary[]> {
    const rows = await this.db.mobileDevice.findMany({
      where: { accountId: auth.account.id, revokedAt: null, refreshExpiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      createdAt: d.createdAt.toISOString(),
      lastSeenAt: d.lastSeenAt.toISOString(),
      current: d.id === auth.session.deviceId,
    }));
  }

  /** People can only sign out their own devices. */
  async removeDevice(auth: AuthContext, id: string): Promise<void> {
    const device = await this.db.mobileDevice.findFirst({
      where: { id, accountId: auth.account.id, revokedAt: null },
    });
    if (!device) throw new NotFoundException();
    await this.revokeDevice(device.id, device.accountId, 'mobile_device_revoked');
  }

  private async exchangeCode(code: string, verifier: string, client: ClientInfo): Promise<OauthTokenResponse> {
    const row = await this.db.oauthCode.findUnique({ where: { codeHash: hashToken(code) } });
    if (!row) throw invalidGrant();
    // Single use: only the request that deletes the row may carry on.
    const { count } = await this.db.oauthCode.deleteMany({ where: { id: row.id } });
    if (count !== 1 || row.expiresAt <= new Date()) throw invalidGrant();
    const expected = createHash('sha256').update(verifier).digest('base64url');
    const a = Buffer.from(expected);
    const b = Buffer.from(row.codeChallenge);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw invalidGrant();
    const membership = await this.activeMembership(row.accountId, row.membershipId);
    if (!membership) throw invalidGrant();

    const refresh = newSessionToken();
    const device = await this.db.mobileDevice.create({
      data: {
        accountId: row.accountId,
        membershipId: row.membershipId,
        name: row.deviceName,
        refreshHash: refresh.tokenHash,
        refreshExpiresAt: new Date(Date.now() + REFRESH_MS),
        lastIp: client.ip,
      },
    });
    const access = await this.issueAccess(device.id, row.accountId, membership, client);
    await this.event('mobile_sign_in', row.accountId, membership.tenantId, client.ip);
    await this.enforceDeviceLimit(row.accountId, device.id, client.ip);
    return tokens(access, refresh.token);
  }

  private async refresh(token: string, client: ClientInfo): Promise<OauthTokenResponse> {
    const hash = hashToken(token);
    let device = await this.db.mobileDevice.findUnique({ where: { refreshHash: hash } });
    // The hash the device must still hold for this refresh to go through (compare-and-swap below).
    let expectedHash = hash;
    if (!device) {
      const previous = await this.db.mobileDevice.findFirst({ where: { previousHash: hash, revokedAt: null } });
      if (!previous) throw invalidGrant();
      const age = Date.now() - (previous.refreshRotatedAt?.getTime() ?? 0);
      if (age > MOBILE_REFRESH_GRACE_SECONDS * 1000) {
        // An old token replayed after the window means it was copied: sign that device out.
        await this.revokeDevice(previous.id, previous.accountId, 'mobile_refresh_reuse', client.ip);
        throw invalidGrant();
      }
      // Just changed: the phone most likely never received the answer. Treat the retry as the refresh it is, and
      // swap whatever the device holds now, which the phone never saw.
      await this.event('mobile_refresh_retry', previous.accountId, undefined, client.ip);
      device = previous;
      expectedHash = previous.refreshHash;
    }
    if (device.revokedAt || device.refreshExpiresAt <= new Date()) throw invalidGrant();
    const membership = await this.activeMembership(device.accountId, device.membershipId);
    if (!membership) {
      await this.revokeDevice(device.id, device.accountId, 'mobile_device_revoked', client.ip);
      throw invalidGrant();
    }
    const next = newSessionToken();
    // Compare-and-swap on the old hash, so two parallel refreshes can't both win.
    const { count } = await this.db.mobileDevice.updateMany({
      where: { id: device.id, refreshHash: expectedHash, revokedAt: null },
      data: {
        refreshHash: next.tokenHash,
        previousHash: expectedHash,
        refreshRotatedAt: new Date(),
        refreshExpiresAt: new Date(Date.now() + REFRESH_MS),
        lastSeenAt: new Date(),
        lastIp: client.ip,
      },
    });
    if (count !== 1) throw invalidGrant();
    await this.db.session.deleteMany({ where: { deviceId: device.id } });
    const access = await this.issueAccess(device.id, device.accountId, membership, client);
    return tokens(access, next.token);
  }

  private async issueAccess(
    deviceId: string,
    accountId: string,
    membership: { id: string; tenantId: string },
    client: ClientInfo,
  ): Promise<string> {
    const { token, tokenHash } = newSessionToken();
    await this.db.session.create({
      data: {
        tokenHash,
        accountId,
        membershipId: membership.id,
        tenantId: membership.tenantId,
        deviceId,
        expiresAt: new Date(Date.now() + MOBILE_ACCESS_TOKEN_SECONDS * 1000),
        ip: client.ip,
        userAgent: client.userAgent?.slice(0, 512),
      },
    });
    return token;
  }

  private activeMembership(accountId: string, membershipId: string) {
    return withAccount(this.db, accountId, (tx) =>
      tx.membership.findFirst({
        where: { id: membershipId, accountId, status: 'active', tenant: { status: 'active' } },
        select: { id: true, tenantId: true },
      }),
    );
  }

  /** Keeps at most MOBILE_DEVICE_LIMIT phones signed in: the least recently used beyond that are signed out. */
  private async enforceDeviceLimit(accountId: string, keepId: string, ip?: string): Promise<void> {
    const devices = await this.db.mobileDevice.findMany({
      where: { accountId, revokedAt: null },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    for (const old of devices.slice(MOBILE_DEVICE_LIMIT).filter((d) => d.id !== keepId)) {
      await this.revokeDevice(old.id, accountId, 'mobile_device_limit', ip);
    }
  }

  private async revokeDevice(id: string, accountId: string, type: string, ip?: string): Promise<void> {
    await this.db.session.deleteMany({ where: { deviceId: id } });
    await this.db.mobileDevice.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.event(type, accountId, undefined, ip);
  }

  private async event(type: string, accountId: string, tenantId?: string, ip?: string) {
    await this.db.authEvent.create({ data: { type, accountId, tenantId, ip } });
  }
}

function tokens(access: string, refresh: string): OauthTokenResponse {
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: MOBILE_ACCESS_TOKEN_SECONDS,
    refresh_token: refresh,
  };
}
