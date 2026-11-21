import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { newToken, withTenant } from '@cafm/db';
import { inviteCreateSchema, licenceForRole } from '@cafm/shared';
import { assertCanGrant } from '../../core/access-rules';
import { audit } from '../../core/audit';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { appUrl, queueTenantEmail } from '../../core/mail';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Invite people into the current organisation (doc 03 § People & access, doc 06 accept-invite). */
@Controller('people/invites')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class InvitesController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('people.invite')
  async list(@Req() req: Request) {
    const tenantId = req.auth!.membership!.tenantId;
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx.invite.findMany({
        where: { tenantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return rows.map(({ tokenHash: _secret, ...invite }) => invite);
  }

  @Post()
  @RequirePermission('people.invite')
  async create(@Body() body: unknown, @Req() req: Request) {
    const input = parse(inviteCreateSchema, body);
    const auth = req.auth!;
    const membership = auth.membership!;
    const tenantId = membership.tenantId;
    const { token, tokenHash } = newToken();

    const invite = await withTenant(this.db, tenantId, async (tx) => {
      const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: input.role } } });
      if (!role) throw new NotFoundException({ code: 'unknown_role' });
      // Inviting someone into a role is granting it: same escalation rules.
      assertCanGrant(auth.access!, membership.role, role.permissions);

      const account = await tx.account.findUnique({ where: { email: input.email } });
      if (account && (await tx.membership.count({ where: { tenantId, accountId: account.id } }))) {
        throw new ConflictException({
          code: 'already_member',
          message: 'That person is already in this organisation.',
        });
      }
      // A new invite replaces any earlier pending one to the same address.
      await tx.invite.updateMany({
        where: { tenantId, email: input.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created = await tx.invite.create({
        data: {
          tenantId,
          email: input.email,
          role: role.key,
          licence: licenceForRole(role.key),
          tokenHash,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          invitedByMembershipId: membership.id,
        },
      });
      await queueTenantEmail(tx, tenantId, {
        to: input.email,
        subject: `${auth.account.name} invited you to ${membership.tenant.name} on CAFM`,
        text: [
          'Hello,',
          '',
          `${auth.account.name} has invited you to join ${membership.tenant.name} on CAFM as ${role.name}.`,
          '',
          `Accept the invitation (the link works for 7 days): ${appUrl()}/accept-invite/${token}`,
        ].join('\n'),
        capture: membership.tenant.demo,
      });
      await audit(
        tx,
        auth,
        {
          action: 'invite.created',
          entityType: 'invite',
          entityId: created.id,
          changes: { after: { email: input.email, role: role.key } },
        },
        req.ip,
      );
      return created;
    });

    const { tokenHash: _secret, ...safe } = invite;
    return safe;
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('people.invite')
  async revoke(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    await withTenant(this.db, tenantId, async (tx) => {
      const invite = await tx.invite.findFirst({ where: { id, tenantId, acceptedAt: null, revokedAt: null } });
      if (!invite) throw new NotFoundException();
      await tx.invite.update({ where: { id }, data: { revokedAt: new Date() } });
      await audit(
        tx,
        auth,
        { action: 'invite.revoked', entityType: 'invite', entityId: id, changes: { before: { email: invite.email } } },
        req.ip,
      );
    });
  }
}
