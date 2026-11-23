import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Prisma, type Tx } from '@cafm/db';
import {
  VIEW_ENTITIES,
  VIEW_ENTITY_ACCESS,
  savedViewSchema,
  updateSavedViewSchema,
  viewConfigSchema,
  type SavedView,
  type ViewEntity,
} from '@cafm/shared';
import { audit } from '../../core/audit';
import { assertAccess, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';

/** Most views one person can keep for one list. Stops a script filling the table. */
const MAX_VIEWS_PER_LIST = 50;

type ViewRow = Prisma.SavedViewGetPayload<{ include: { owner: { include: { account: { select: { name: true } } } } } }>;
const withOwner = { owner: { include: { account: { select: { name: true } } } } } as const;

function toView(row: ViewRow, memberId: string): SavedView {
  return {
    id: row.id,
    entity: row.entity as ViewEntity,
    name: row.name,
    visibility: row.visibility as SavedView['visibility'],
    // Stored configs were validated on the way in; parsing again keeps old rows readable if the shape grows.
    config: viewConfigSchema.parse(row.config),
    mine: row.ownerId === memberId,
    ownerName: row.owner.account.name,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function entityOrThrow(value: unknown): ViewEntity {
  if (typeof value === 'string' && (VIEW_ENTITIES as readonly string[]).includes(value)) return value as ViewEntity;
  throw new UnprocessableEntityException(`Choose a list: ${VIEW_ENTITIES.join(', ')}.`);
}

/** Saved list views: private to their owner, or shared with the organisation by someone who may share. */
@Controller('views')
@UseGuards(SessionGuard, TenantGuard)
export class ViewsController {
  constructor(private readonly db: PrismaService) {}

  /** A view of a list is for people who can see that list, so each call checks the list's own feature and permission. */
  private static check(req: Request, entity: ViewEntity): void {
    const { feature, permission } = VIEW_ENTITY_ACCESS[entity];
    assertAccess(req.auth!.access, feature, permission);
  }

  private static mayShare(req: Request): boolean {
    return req.auth!.access?.permissions.has('views.share') === true;
  }

  @Get()
  list(@Req() req: Request, @Query('entity') entityParam?: string) {
    const entity = entityOrThrow(entityParam);
    ViewsController.check(req, entity);
    const { tenantId, id: memberId } = req.auth!.membership!;
    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx.savedView.findMany({
        where: { tenantId, entity, OR: [{ ownerId: memberId }, { visibility: 'shared' }] },
        include: withOwner,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      return rows.map((row) => toView(row, memberId));
    });
  }

  @Post()
  create(@Req() req: Request, @Body() body: unknown) {
    const input = parse(savedViewSchema, body);
    ViewsController.check(req, input.entity);
    if (input.visibility === 'shared' && !ViewsController.mayShare(req)) {
      throw new ForbiddenException('You can keep private views. Ask an administrator to share a view.');
    }
    const auth = req.auth!;
    const { tenantId, id: memberId } = auth.membership!;
    return withTenant(this.db, tenantId, async (tx) => {
      const mine = await tx.savedView.findMany({
        where: { tenantId, ownerId: memberId, entity: input.entity },
        select: { name: true },
      });
      if (mine.length >= MAX_VIEWS_PER_LIST) {
        throw new UnprocessableEntityException(
          `You can keep ${MAX_VIEWS_PER_LIST} views for one list. Delete one first.`,
        );
      }
      if (mine.some((view) => view.name.toLowerCase() === input.name.toLowerCase())) {
        throw new ConflictException('You already have a view with that name.');
      }
      const row = await tx.savedView.create({
        data: {
          tenantId,
          ownerId: memberId,
          entity: input.entity,
          name: input.name,
          visibility: input.visibility,
          config: input.config as unknown as Prisma.InputJsonValue,
        },
        include: withOwner,
      });
      await audit(
        tx,
        auth,
        {
          action: 'saved_view.create',
          entityType: 'saved_view',
          entityId: row.id,
          changes: { entity: row.entity, name: row.name, visibility: row.visibility },
        },
        req.ip,
      );
      return toView(row, memberId);
    });
  }

  @Put(':id')
  update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(updateSavedViewSchema, body);
    const auth = req.auth!;
    const { tenantId, id: memberId } = auth.membership!;
    return withTenant(this.db, tenantId, async (tx) => {
      const before = await this.visible(tx, tenantId, memberId, id);
      ViewsController.check(req, before.entity as ViewEntity);
      // Only the owner edits a view: sharing someone's view with the organisation doesn't hand over its settings.
      if (before.ownerId !== memberId) throw new ForbiddenException('Only the person who made a view can change it.');
      if (input.visibility === 'shared' && before.visibility !== 'shared' && !ViewsController.mayShare(req)) {
        throw new ForbiddenException('You can keep private views. Ask an administrator to share a view.');
      }
      if (before.version !== input.version) {
        throw new ConflictException({
          code: 'stale_view',
          message: 'This view has changed. Refresh it and try again.',
        });
      }
      const clash = await tx.savedView.findFirst({
        where: {
          tenantId,
          ownerId: memberId,
          entity: before.entity,
          id: { not: id },
          name: { equals: input.name, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (clash) throw new ConflictException('You already have a view with that name.');
      const row = await tx.savedView.update({
        where: { id },
        data: {
          name: input.name,
          visibility: input.visibility,
          config: input.config as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
        include: withOwner,
      });
      await audit(
        tx,
        auth,
        {
          action: 'saved_view.update',
          entityType: 'saved_view',
          entityId: id,
          changes: {
            before: { name: before.name, visibility: before.visibility },
            after: { name: row.name, visibility: row.visibility },
          },
        },
        req.ip,
      );
      return toView(row, memberId);
    });
  }

  /** The owner can delete their view. Someone who may share can also remove a shared view they don't own. */
  @Delete(':id')
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    const { tenantId, id: memberId } = auth.membership!;
    return withTenant(this.db, tenantId, async (tx) => {
      const row = await this.visible(tx, tenantId, memberId, id);
      ViewsController.check(req, row.entity as ViewEntity);
      const moderating = row.visibility === 'shared' && ViewsController.mayShare(req);
      if (row.ownerId !== memberId && !moderating) {
        throw new ForbiddenException('Only the person who made a view can delete it.');
      }
      await tx.savedView.delete({ where: { id } });
      await audit(
        tx,
        auth,
        {
          action: 'saved_view.delete',
          entityType: 'saved_view',
          entityId: id,
          changes: {
            entity: row.entity,
            name: row.name,
            visibility: row.visibility,
            ownedByActor: row.ownerId === memberId,
          },
        },
        req.ip,
      );
      return { ok: true };
    });
  }

  /** A view the member may see: their own, or shared. Anything else is "not found", so private views stay unknown. */
  private async visible(tx: Tx, tenantId: string, memberId: string, id: string) {
    const row = await tx.savedView.findFirst({
      where: { tenantId, id, OR: [{ ownerId: memberId }, { visibility: 'shared' }] },
    });
    if (!row) throw new NotFoundException({ code: 'view_not_found', message: 'View not found.' });
    return row;
  }
}
