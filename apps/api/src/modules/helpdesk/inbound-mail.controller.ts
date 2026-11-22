import { Body, Controller, NotFoundException, Param, ParseUUIDPipe, Post, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { Req } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { withTenant } from '@cafm/db';
import { incomingRequestSchema, resolveEntitlements } from '@cafm/shared';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { CLOSED, createRequest } from './request-records';
import { lockRequests } from './request-scope';

function bearerMatch(actual: string | undefined, secret: string | undefined) {
  if (!actual?.startsWith('Bearer ') || !secret || secret.length < 32) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(actual.slice(7)), digest(secret));
}

@Controller('helpdesk/inbound')
export class InboundMailController {
  constructor(private readonly db: PrismaService) {}

  @Post(':slug/:mailboxId')
  async receive(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Param('mailboxId', ParseUUIDPipe) mailboxId: string,
    @Body() body: unknown,
  ) {
    if (!bearerMatch(req.get('authorization'), process.env.HELPDESK_INBOUND_TOKEN)) throw new UnauthorizedException();
    const mail = parse(incomingRequestSchema, body);
    const tenant = await this.db.tenant.findUnique({ where: { slug } });
    if (!tenant || tenant.status !== 'active') throw new NotFoundException();
    const tenantId = tenant.id;
    return withTenant(this.db, tenantId, async (tx) => {
      await lockRequests(tx, tenantId);
      const overrides = await tx.tenantEntitlement.findMany({ where: { tenantId } });
      if (!resolveEntitlements(tenant.plan, overrides).features.includes('helpdesk')) throw new NotFoundException();
      const mailbox = await tx.requestMailbox.findFirst({ where: { id: mailboxId, active: true, address: mail.to } });
      if (!mailbox) throw new NotFoundException();
      const deliveryKey = { tenantId, mailboxId, messageId: mail.messageId };
      const existing = await tx.receivedRequestMessage.findUnique({
        where: { tenantId_mailboxId_messageId: deliveryKey },
        select: { requestId: true },
      });
      if (existing) return existing;
      let requestId: string | undefined;
      if (mail.inReplyTo) {
        const referencedMail = await tx.receivedRequestMessage.findFirst({
          where: { tenantId, mailboxId, messageId: mail.inReplyTo, sender: mail.from },
          select: { requestId: true },
        });
        requestId = referencedMail?.requestId;
        const notificationId = mail.inReplyTo.match(/^<cafm-([a-f0-9-]{36})@cafm\.invalid>$/i)?.[1];
        if (!requestId && notificationId) {
          const notification = await tx.notification.findFirst({
            where: {
              id: notificationId,
              tenantId,
              recipientEmail: mail.from,
              request: { receivedMessages: { some: { mailboxId, sender: mail.from } } },
            },
            select: { requestId: true },
          });
          requestId = notification?.requestId ?? undefined;
        }
      }
      const original = requestId && (await tx.serviceRequest.findFirst({ where: { id: requestId, tenantId } }));
      if (original && !CLOSED.includes(original.status)) {
        await tx.serviceRequest.update({ where: { id: original.id }, data: { updatedAt: new Date() } });
        await tx.requestEntry.create({
          data: { tenantId, requestId: original.id, kind: 'comment', body: mail.text },
        });
        await tx.auditEvent.create({
          data: { tenantId, entityType: 'request', entityId: original.id, action: 'request.email_reply' },
        });
        requestId = original.id;
      } else {
        const created = await createRequest(
          tx,
          {
            submissionId: mailboxId,
            locationId: mailbox.locationId,
            typeId: mailbox.typeId,
            title: mail.subject,
            description: mail.text,
            assetId: null,
            channel: 'portal',
            answers: {},
            custom: {},
          },
          null,
          undefined,
          { tenantId, key: 'email:' + mailboxId + ':' + mail.messageId, from: mail.from },
        );
        requestId = created.id;
      }
      await tx.receivedRequestMessage.create({ data: { ...deliveryKey, requestId, sender: mail.from } });
      return { requestId };
    });
  }
}
