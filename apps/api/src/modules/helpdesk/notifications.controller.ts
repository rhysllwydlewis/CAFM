import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant } from '@cafm/db';
import { pushSubscriptionSchema, type NotificationItem } from '@cafm/shared';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';

@Controller('notifications')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('helpdesk')
@RequirePermission('requests.create')
export class NotificationsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  list(@Req() req: Request) {
    const { tenantId, id, tenant } = req.auth!.membership!;
    return withTenant(this.db, tenantId, async (tx) => {
      const where = { tenantId, recipientId: id };
      const [rows, unread, subscriptions] = await Promise.all([
        tx.notification.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
        }),
        tx.notification.count({ where: { ...where, readAt: null } }),
        tx.pushSubscription.count({ where: { tenantId, membershipId: id } }),
      ]);
      const items: NotificationItem[] = rows.map(({ id, title, body, requestId, readAt, createdAt }) => ({
        id,
        title,
        body,
        requestId,
        readAt: readAt?.toISOString() ?? null,
        createdAt: createdAt.toISOString(),
      }));
      return { items, unread, subscriptions, pushKey: tenant.demo ? null : (process.env.WEB_PUSH_PUBLIC_KEY ?? null) };
    });
  }

  @Patch(':id/read')
  read(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const member = req.auth!.membership!;
    return withTenant(this.db, member.tenantId, async (tx) => {
      const where = { id, tenantId: member.tenantId, recipientId: member.id };
      const match = await tx.notification.findFirst({ where, select: { id: true } });
      if (!match) throw new NotFoundException();
      await tx.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
      return { id };
    });
  }

  @Patch('read-all')
  readAll(@Req() req: Request) {
    const { tenantId, id } = req.auth!.membership!;
    return withTenant(this.db, tenantId, (tx) =>
      tx.notification.updateMany({
        where: { tenantId, recipientId: id, readAt: null },
        data: { readAt: new Date() },
      }),
    );
  }

  @Post('push')
  subscribe(@Req() req: Request, @Body() body: unknown) {
    const member = req.auth!.membership!;
    if (member.tenant.demo || !process.env.WEB_PUSH_PUBLIC_KEY)
      throw new NotFoundException('Browser push unavailable.');
    const { endpoint, keys } = parse(pushSubscriptionSchema, body);
    const data = { tenantId: member.tenantId, membershipId: member.id, endpoint };
    return withTenant(this.db, member.tenantId, async (tx) => {
      await tx.pushSubscription.upsert({
        where: { tenantId_membershipId_endpoint: data },
        create: { ...data, ...keys },
        update: keys,
      });
      return { subscribed: true };
    });
  }

  @Delete('push')
  unsubscribe(@Req() req: Request, @Body('endpoint') endpoint: string) {
    const { tenantId, id: membershipId } = req.auth!.membership!;
    if (!endpoint || typeof endpoint !== 'string' || endpoint.length > 2048) throw new NotFoundException();
    return withTenant(this.db, tenantId, (tx) =>
      tx.pushSubscription.deleteMany({ where: { tenantId, membershipId, endpoint } }),
    );
  }
}
