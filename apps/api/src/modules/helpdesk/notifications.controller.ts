import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { withTenant, type Prisma } from '@fmstead/db';
import { pushEndpointSchema, pushSubscriptionSchema, type NotificationItem } from '@fmstead/shared';
import { SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { assetScope } from '../assets/asset-scope';
import { workOrderScope } from '../work-orders/work-order-scope';

function configuredPushKey(): string | null {
  const { WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT } = process.env;
  return WEB_PUSH_PUBLIC_KEY && WEB_PUSH_PRIVATE_KEY && WEB_PUSH_SUBJECT ? WEB_PUSH_PUBLIC_KEY : null;
}

function inboxScope(req: Request): Prisma.NotificationWhereInput {
  const auth = req.auth!;
  const { tenantId, id: recipientId } = auth.membership!;
  const { entitlements, permissions } = auth.access!;
  const scopes: Prisma.NotificationWhereInput[] = [];
  if (entitlements.features.includes('helpdesk') && permissions.has('requests.create')) {
    scopes.push({ assetId: null, workOrderId: null });
  }
  if (entitlements.features.includes('assets') && permissions.has('assets.read') && permissions.has('assets.manage')) {
    scopes.push({ asset: { is: { ...assetScope(auth), status: { not: 'decommissioned' } } } });
  }
  if (entitlements.features.includes('work_orders') && permissions.has('work_orders.read')) {
    scopes.push({ workOrder: { is: workOrderScope(auth) } });
  }
  if (!scopes.length) throw new ForbiddenException();
  return { tenantId, recipientId, OR: scopes };
}

@Controller('notifications')
@UseGuards(SessionGuard, TenantGuard)
export class NotificationsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  list(@Req() req: Request) {
    const { tenantId, tenant } = req.auth!.membership!;
    return withTenant(this.db, tenantId, async (tx) => {
      const where = inboxScope(req);
      const [rows, unread] = await Promise.all([
        tx.notification.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
        }),
        tx.notification.count({ where: { ...where, readAt: null } }),
      ]);
      const items: NotificationItem[] = rows.map(
        ({ id, title, body, requestId, assetId, workOrderId, readAt, createdAt }) => ({
          id,
          title,
          body,
          requestId,
          assetId,
          workOrderId,
          readAt: readAt?.toISOString() ?? null,
          createdAt: createdAt.toISOString(),
        }),
      );
      return { items, unread, pushKey: tenant.demo ? null : configuredPushKey() };
    });
  }

  @Patch(':id/read')
  read(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const member = req.auth!.membership!;
    return withTenant(this.db, member.tenantId, async (tx) => {
      const where = { ...inboxScope(req), id };
      const match = await tx.notification.findFirst({ where, select: { id: true } });
      if (!match) throw new NotFoundException();
      await tx.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
      return { id };
    });
  }

  @Patch('read-all')
  readAll(@Req() req: Request) {
    const { tenantId } = req.auth!.membership!;
    return withTenant(this.db, tenantId, (tx) =>
      tx.notification.updateMany({
        where: { ...inboxScope(req), readAt: null },
        data: { readAt: new Date() },
      }),
    );
  }

  @Post('push/status')
  async pushStatus(@Req() req: Request, @Body() body: unknown) {
    inboxScope(req);
    const { tenantId, id: membershipId } = req.auth!.membership!;
    const { endpoint } = parse(pushEndpointSchema, body);
    const match = await withTenant(this.db, tenantId, (tx) =>
      tx.pushSubscription.findUnique({
        where: { tenantId_membershipId_endpoint: { tenantId, membershipId, endpoint } },
        select: { id: true },
      }),
    );
    return { subscribed: !!match };
  }

  @Post('push')
  subscribe(@Req() req: Request, @Body() body: unknown) {
    const member = req.auth!.membership!;
    inboxScope(req);
    if (member.tenant.demo || !configuredPushKey()) throw new NotFoundException('Browser push unavailable.');
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
    inboxScope(req);
    const { tenantId, id: membershipId } = req.auth!.membership!;
    if (!endpoint || typeof endpoint !== 'string' || endpoint.length > 2048) throw new NotFoundException();
    return withTenant(this.db, tenantId, (tx) =>
      tx.pushSubscription.deleteMany({ where: { tenantId, membershipId, endpoint } }),
    );
  }
}
