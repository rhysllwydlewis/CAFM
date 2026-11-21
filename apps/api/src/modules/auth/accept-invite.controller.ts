import {
  Body,
  Controller,
  Get,
  GoneException,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import { hashToken, type Invite, withTenant } from '@cafm/db';
import {
  acceptInviteSchema,
  type InviteDetails,
  type LoginResponse,
  passwordProblem,
  TERMS_VERSION,
} from '@cafm/shared';
import { clientInfo, sessionToken, setSessionCookie } from '../../core/cookies';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { AuthService } from './auth.service';

function statusOf(invite: Invite): InviteDetails['status'] {
  if (invite.acceptedAt) return 'accepted';
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt <= new Date()) return 'expired';
  return 'pending';
}

/** Accepting an invitation (doc 06 `/accept-invite/:token`). No session or tenant needed to start. */
@Controller('auth/invites')
export class AcceptInviteController {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** Finds the invite's tenant from the token only (find_invite), then works inside that tenant. */
  private async locate(token: string): Promise<{ id: string; tenantId: string }> {
    const [found] = await this.db.$queryRaw<
      { id: string; tenant_id: string }[]
    >`SELECT id, tenant_id FROM find_invite(${hashToken(token)})`;
    if (!found) throw new NotFoundException({ code: 'invite_not_found' });
    return { id: found.id, tenantId: found.tenant_id };
  }

  @Get(':token')
  async details(@Param('token') token: string): Promise<InviteDetails> {
    const { id, tenantId } = await this.locate(token);
    return withTenant(this.db, tenantId, async (tx) => {
      const invite = await tx.invite.findUniqueOrThrow({ where: { id }, include: { tenant: true } });
      const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: invite.role } } });
      const account = await tx.account.findUnique({ where: { email: invite.email }, select: { id: true } });
      return {
        tenantName: invite.tenant.name,
        email: invite.email,
        roleLabel: role?.name ?? invite.role,
        accountExists: !!account,
        status: statusOf(invite),
      };
    });
  }

  /**
   * Accepts the invite. New people set their name and password here; people
   * who already have an account must be signed in as that account. Either
   * way they accept the terms and end up signed in to the organisation.
   */
  @Post(':token/accept')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const input = parse(acceptInviteSchema, body);
    const { id, tenantId } = await this.locate(token);
    const client = clientInfo(req);

    // Who is accepting: the signed-in account (must match the invite) or a new account.
    const current = sessionToken(req);
    const session = current
      ? await this.db.session.findUnique({ where: { tokenHash: hashToken(current) }, include: { account: true } })
      : null;

    const result = await withTenant(this.db, tenantId, async (tx) => {
      const invite = await tx.invite.findUniqueOrThrow({ where: { id } });
      if (statusOf(invite) !== 'pending') {
        throw new GoneException({
          code: 'invite_unusable',
          message: 'This invitation has expired or has already been used. Ask for a new one.',
        });
      }
      const now = new Date();
      let account = await tx.account.findUnique({ where: { email: invite.email } });
      if (account) {
        if (!session || session.expiresAt <= now || session.accountId !== account.id) {
          throw new UnauthorizedException({
            code: 'sign_in_required',
            message: `Sign in as ${invite.email} to accept this invitation.`,
          });
        }
        account = await tx.account.update({
          where: { id: account.id },
          data: { termsVersion: TERMS_VERSION, termsAcceptedAt: now },
        });
      } else {
        if (!input.name || !input.password) {
          throw new UnprocessableEntityException({
            code: 'details_required',
            message: 'Enter your name and choose a password.',
          });
        }
        const problem = passwordProblem(input.password, invite.email);
        if (problem) throw new UnprocessableEntityException({ code: 'weak_password', message: problem });
        account = await tx.account.create({
          data: {
            email: invite.email,
            name: input.name,
            passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
            termsVersion: TERMS_VERSION,
            termsAcceptedAt: now,
          },
        });
      }
      // If they joined some other way since the invite was sent, keep their membership as it is.
      const membership =
        (await tx.membership.findFirst({ where: { tenantId, accountId: account.id } })) ??
        (await tx.membership.create({
          data: { tenantId, accountId: account.id, role: invite.role, licence: invite.licence },
        }));
      await tx.invite.update({ where: { id }, data: { acceptedAt: now } });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorAccountId: account.id,
          actorMembershipId: membership.id,
          action: 'invite.accepted',
          entityType: 'invite',
          entityId: id,
          changes: { after: { email: invite.email, role: invite.role } },
          ip: client.ip,
        },
      });
      return { account, membership };
    });

    if (session) await this.db.session.deleteMany({ where: { id: session.id } });
    const issued = await this.auth.issueSession(result.account.id, result.membership.id, tenantId, false, client);
    setSessionCookie(res, issued);
    await this.auth.event('invite_accepted', { accountId: result.account.id, tenantId, ip: client.ip });
    return { status: 'signed_in', landingPage: result.membership.landingPage };
  }
}
