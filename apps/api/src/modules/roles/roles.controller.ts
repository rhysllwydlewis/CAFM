import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Tx } from '@fmstead/db';
import { createRoleSchema, updateRoleSchema } from '@fmstead/shared';
import { assertCanGrant, assertNotDemoLocked } from '../../core/access-rules';
import { audit } from '../../core/audit';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';

function slug(name: string): string {
  return (
    'custom_' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48)
  );
}

/**
 * Role names are shown side by side in pickers, so no two may match, whatever the case. The check covers the
 * built-in roles as well, which stops a custom role passing for one of them.
 */
async function assertNameFree(tx: Tx, tenantId: string, name: string, exceptId?: string): Promise<void> {
  const clash = await tx.role.findFirst({
    where: { tenantId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ConflictException({ code: 'role_exists', message: 'A role with that name already exists.' });
}

/** Roles inside the current organisation (doc 03). */
@Controller('roles')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('roles.read')
  async list(@Req() req: Request) {
    const tenantId = req.auth!.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const [roles, counts] = await Promise.all([
        tx.role.findMany({ where: { tenantId }, orderBy: [{ builtin: 'desc' }, { name: 'asc' }] }),
        tx.membership.groupBy({ by: ['role'], where: { tenantId, status: 'active' }, _count: true }),
      ]);
      const members = new Map(counts.map((c) => [c.role, c._count]));
      return roles.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        permissions: r.permissions,
        scope: r.scope,
        builtin: r.builtin,
        members: members.get(r.key) ?? 0,
      }));
    });
  }

  @Post()
  @RequirePermission('roles.manage')
  async create(@Body() body: unknown, @Req() req: Request) {
    const input = parse(createRoleSchema, body);
    const auth = req.auth!;
    assertCanGrant(auth.access!, auth.membership!.role, input.permissions);
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      await assertNameFree(tx, tenantId, input.name);
      const key = slug(input.name);
      if (await tx.role.findUnique({ where: { tenantId_key: { tenantId, key } } })) {
        throw new ConflictException({ code: 'role_exists', message: 'A role with that name already exists.' });
      }
      const role = await tx.role.create({
        data: {
          tenantId,
          key,
          name: input.name,
          description: input.description,
          permissions: [...new Set(input.permissions)],
          scope: input.scope,
        },
      });
      await audit(
        tx,
        auth,
        { action: 'role.created', entityType: 'role', entityId: role.id, changes: { after: input } },
        req.ip,
      );
      return role;
    });
  }

  @Patch(':id')
  @RequirePermission('roles.manage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request) {
    const input = parse(updateRoleSchema, body);
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const role = await tx.role.findFirst({ where: { id, tenantId } });
      if (!role) throw new NotFoundException();
      if (role.key === 'super_user') throw new ForbiddenException({ code: 'super_user_role_locked' });
      assertNotDemoLocked(role.builtin);
      if (input.name !== undefined) await assertNameFree(tx, tenantId, input.name, id);
      // Editing a role is granting its permissions: check both the old and the new set.
      assertCanGrant(auth.access!, auth.membership!.role, role.permissions);
      if (input.permissions) assertCanGrant(auth.access!, auth.membership!.role, input.permissions);
      const updated = await tx.role.update({
        where: { id },
        data: { ...input, ...(input.permissions ? { permissions: [...new Set(input.permissions)] } : {}) },
      });
      await audit(
        tx,
        auth,
        {
          action: 'role.updated',
          entityType: 'role',
          entityId: id,
          changes: {
            before: { name: role.name, permissions: role.permissions, scope: role.scope },
            after: { name: updated.name, permissions: updated.permissions, scope: updated.scope },
          },
        },
        req.ip,
      );
      return updated;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('roles.manage')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    await withTenant(this.db, tenantId, async (tx) => {
      const role = await tx.role.findFirst({ where: { id, tenantId } });
      if (!role) throw new NotFoundException();
      if (role.builtin) throw new ForbiddenException({ code: 'builtin_role' });
      assertCanGrant(auth.access!, auth.membership!.role, role.permissions);
      if (await tx.membership.count({ where: { tenantId, role: role.key } })) {
        throw new ConflictException({
          code: 'role_in_use',
          message: 'Move everyone off this role before deleting it.',
        });
      }
      await tx.role.delete({ where: { id } });
      await audit(
        tx,
        auth,
        { action: 'role.deleted', entityType: 'role', entityId: id, changes: { before: { name: role.name } } },
        req.ip,
      );
    });
  }
}
