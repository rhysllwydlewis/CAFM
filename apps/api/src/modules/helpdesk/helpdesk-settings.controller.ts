import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Prisma, type Tx } from '@fmstead/db';
import {
  defaultRequestPriority,
  NOTIFICATION_EVENTS,
  notificationTemplateSchema,
  requestMailboxSchema,
  requestPrioritySchema,
  requestTypeSchema,
  updateRequestMailboxSchema,
  updateRequestTypeSchema,
  type RequestNotificationEvent,
} from '@fmstead/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { recordVersion } from '../../core/config';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { parse } from '../../core/validation';
import { locationScope } from '../locations/location-tree';
import { requestNotificationDefault } from './request-notifications';
import { eligibleAssignee } from './request-records';
import { reportLocations, staleRequest, withRequestWrite } from './request-scope';

async function settingsChange(tx: Tx, auth: AuthContext, kind: string, id: string, data: Prisma.InputJsonObject) {
  await recordVersion(tx, auth, kind, id, data);
  await audit(tx, auth, { action: kind + '.save', entityType: kind, entityId: id });
}

async function validateMailbox(
  tx: Tx,
  auth: AuthContext,
  input: { address: string; typeId: string; locationId: string; active: boolean },
  id?: string,
) {
  const [location, type, existing] = await Promise.all([
    tx.location.findFirst({
      where: { ...(input.active ? reportLocations(auth) : locationScope(auth)), id: input.locationId },
      select: { id: true },
    }),
    tx.requestType.findFirst({
      where: { id: input.typeId, ...(input.active ? { active: true } : {}) },
      select: { id: true },
    }),
    tx.requestMailbox.findFirst({
      where: { address: input.address, NOT: id ? { id } : undefined },
      select: { id: true },
    }),
  ]);
  if (!location || !type) throw new BadRequestException('Choose an active type and an open location.');
  if (existing) throw new ConflictException('A mailbox already uses this address.');
}

@Controller('helpdesk/settings')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('helpdesk')
@RequirePermission('settings.manage')
export class HelpdeskSettingsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  settings(@Req() req: Request) {
    const tenantId = req.auth!.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const [types, rules, mailboxes, templates] = await Promise.all([
        tx.requestType.findMany({
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
          include: { assignee: { select: { account: { select: { name: true } } } } },
        }),
        tx.requestPriority.findMany(),
        tx.requestMailbox.findMany({
          where: { location: locationScope(req.auth!) },
          orderBy: { address: 'asc' },
          include: { location: { select: { name: true, code: true } } },
        }),
        tx.notificationTemplate.findMany(),
      ]);
      return {
        types: types.map(({ assignee, ...type }) => ({ ...type, assigneeName: assignee?.account.name ?? null })),
        mailboxes,
        matrix: [1, 2, 3].flatMap((impact) =>
          [1, 2, 3].map(
            (urgency) =>
              rules.find((row) => row.impact === impact && row.urgency === urgency) ??
              defaultRequestPriority(impact, urgency),
          ),
        ),
        templates: NOTIFICATION_EVENTS.map(
          (key) => templates.find((row) => row.key === key) ?? requestNotificationDefault(key),
        ),
      };
    });
  }

  @Get('assignees')
  assignees(@Req() req: Request, @Query('q') q?: string) {
    const tenantId = req.auth!.membership!.tenantId;
    const query = typeof q === 'string' ? q.trim().slice(0, 100) : '';
    return withTenant(this.db, tenantId, async (tx) => {
      const roles = await tx.role.findMany({
        where: { tenantId, permissions: { hasEvery: ['requests.manage', 'requests.read'] } },
        select: { key: true },
      });
      const members = await tx.membership.findMany({
        where: {
          tenantId,
          status: 'active',
          licence: 'full',
          role: { in: roles.map(({ key }) => key) },
          account: { name: { contains: query, mode: 'insensitive' } },
        },
        select: { id: true, account: { select: { name: true } } },
        orderBy: [{ account: { name: 'asc' } }, { id: 'asc' }],
        take: 25,
      });
      return members.map(({ id, account }) => ({ id, name: account.name }));
    });
  }

  @Post('types')
  createType(@Req() req: Request, @Body() body: unknown) {
    return this.saveType(req.auth!, parse(requestTypeSchema, body));
  }

  @Patch('types/:id')
  updateType(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { version, ...input } = parse(updateRequestTypeSchema, body);
    return this.saveType(req.auth!, input, { id, version });
  }

  private saveType(
    auth: AuthContext,
    input: ReturnType<typeof requestTypeSchema.parse>,
    edit?: { id: string; version: number },
  ) {
    return withRequestWrite(this.db, auth, 'settings.manage', async (tx, current) => {
      const tenantId = current.membership!.tenantId;
      if (edit) {
        const row = await tx.requestType.findFirst({ where: { id: edit.id } });
        if (!row) throw new NotFoundException('Request type not found.');
        if (row.version !== edit.version) throw staleRequest();
        if (!input.active && (await tx.requestMailbox.count({ where: { typeId: row.id, active: true } }))) {
          throw new ConflictException('Update the active mailboxes that use this type first.');
        }
      }
      if (input.assigneeId && !(await eligibleAssignee(tx, tenantId, input.assigneeId))) {
        throw new BadRequestException('Choose an available Helpdesk assignee.');
      }
      const duplicate = await tx.requestType.findUnique({
        where: {
          tenantId_category_problemCode_name: {
            tenantId,
            category: input.category,
            problemCode: input.problemCode,
            name: input.name,
          },
        },
      });
      if (duplicate && duplicate.id !== edit?.id) throw new ConflictException('This request type already exists.');
      const row = edit
        ? await tx.requestType.update({ where: { id: edit.id }, data: { ...input, version: { increment: 1 } } })
        : await tx.requestType.create({ data: { tenantId, ...input } });
      await settingsChange(tx, current, 'request_type', row.id, input);
      return row;
    });
  }

  @Put('priority')
  priority(@Req() req: Request, @Body() body: unknown) {
    const input = parse(requestPrioritySchema, body);
    return withRequestWrite(this.db, req.auth!, 'settings.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const { impact, urgency } = input;
      const row = await tx.requestPriority.upsert({
        where: { tenantId_impact_urgency: { tenantId, impact, urgency } },
        create: { tenantId, ...input },
        update: input,
      });
      await settingsChange(tx, auth, 'request_priority', row.id, input);
      return row;
    });
  }

  @Post('mailboxes')
  createMailbox(@Req() req: Request, @Body() body: unknown) {
    return this.saveMailbox(req.auth!, parse(requestMailboxSchema, body));
  }

  @Patch('mailboxes/:id')
  updateMailbox(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { version, ...input } = parse(updateRequestMailboxSchema, body);
    return this.saveMailbox(req.auth!, input, { id, version });
  }

  private saveMailbox(
    auth: AuthContext,
    input: ReturnType<typeof requestMailboxSchema.parse>,
    edit?: { id: string; version: number },
  ) {
    return withRequestWrite(this.db, auth, 'settings.manage', async (tx, current) => {
      const tenantId = current.membership!.tenantId;
      if (edit) {
        const old = await tx.requestMailbox.findFirst({ where: { id: edit.id, location: locationScope(current) } });
        if (!old) throw new NotFoundException('Mailbox not found.');
        if (old.version !== edit.version) throw staleRequest();
      }
      await validateMailbox(tx, current, input, edit?.id);
      const row = edit
        ? await tx.requestMailbox.update({ where: { id: edit.id }, data: { ...input, version: { increment: 1 } } })
        : await tx.requestMailbox.create({ data: { tenantId, ...input } });
      await settingsChange(tx, current, 'request_mailbox', row.id, input);
      return row;
    });
  }

  @Put('notifications/:key')
  template(@Req() req: Request, @Param('key') key: string, @Body() body: unknown) {
    if (!(NOTIFICATION_EVENTS as readonly string[]).includes(key)) throw new BadRequestException('Unknown event.');
    const input = parse(notificationTemplateSchema, body);
    return withRequestWrite(this.db, req.auth!, 'settings.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const row = await tx.notificationTemplate.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: { tenantId, key, ...input },
        update: input,
      });
      await settingsChange(tx, auth, 'notification_template', row.id, input);
      return { ...row, key: key as RequestNotificationEvent };
    });
  }
}
