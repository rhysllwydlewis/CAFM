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
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Tx } from '@cafm/db';
import { createTeamSchema, updateTeamSchema, type Team } from '@cafm/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';

/** Teams and groups inside the current organisation (doc 03), used for assignment and scoping. */
@Controller('teams')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class TeamsController {
  constructor(private readonly db: PrismaService) {}

  private async load(tx: Tx, tenantId: string, id?: string): Promise<Team[]> {
    const [teams, roles] = await Promise.all([
      tx.team.findMany({
        where: { tenantId, ...(id ? { id } : {}) },
        include: { members: { include: { membership: { include: { account: true } } } } },
        orderBy: { name: 'asc' },
      }),
      tx.role.findMany({ where: { tenantId }, select: { key: true, name: true } }),
    ]);
    const names = new Map(roles.map((r) => [r.key, r.name]));
    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      members: t.members
        .map((m) => ({
          membershipId: m.membershipId,
          name: m.membership.account.name,
          roleLabel: names.get(m.membership.role) ?? m.membership.role,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }

  private async assertMembers(tx: Tx, tenantId: string, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    const found = await tx.membership.count({ where: { tenantId, id: { in: unique }, status: 'active' } });
    if (found !== unique.length) {
      throw new UnprocessableEntityException({
        code: 'unknown_member',
        message: 'Every team member must be an active person in this organisation.',
      });
    }
    return unique;
  }

  @Get()
  @RequirePermission('people.read')
  async list(@Req() req: Request): Promise<Team[]> {
    const tenantId = req.auth!.membership!.tenantId;
    return withTenant(this.db, tenantId, (tx) => this.load(tx, tenantId));
  }

  @Post()
  @RequirePermission('people.manage')
  async create(@Body() body: unknown, @Req() req: Request): Promise<Team> {
    const input = parse(createTeamSchema, body);
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      if (await tx.team.findUnique({ where: { tenantId_name: { tenantId, name: input.name } } })) {
        throw new ConflictException({ code: 'team_exists', message: 'A team with that name already exists.' });
      }
      const memberIds = await this.assertMembers(tx, tenantId, input.memberIds);
      const team = await tx.team.create({
        data: {
          tenantId,
          name: input.name,
          description: input.description,
        },
      });
      await tx.teamMember.createMany({
        data: memberIds.map((membershipId) => ({ tenantId, teamId: team.id, membershipId })),
      });
      await audit(
        tx,
        auth,
        { action: 'team.created', entityType: 'team', entityId: team.id, changes: { after: { ...input, memberIds } } },
        req.ip,
      );
      return (await this.load(tx, tenantId, team.id))[0]!;
    });
  }

  @Patch(':id')
  @RequirePermission('people.manage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request): Promise<Team> {
    const input = parse(updateTeamSchema, body);
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const [before] = await this.load(tx, tenantId, id);
      if (!before) throw new NotFoundException();
      if (input.name && input.name !== before.name) {
        if (await tx.team.findUnique({ where: { tenantId_name: { tenantId, name: input.name } } })) {
          throw new ConflictException({ code: 'team_exists', message: 'A team with that name already exists.' });
        }
      }
      await tx.team.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      });
      let memberIds: string[] | undefined;
      if (input.memberIds) {
        memberIds = await this.assertMembers(tx, tenantId, input.memberIds);
        await tx.teamMember.deleteMany({ where: { tenantId, teamId: id } });
        await tx.teamMember.createMany({
          data: memberIds.map((membershipId) => ({ tenantId, teamId: id, membershipId })),
        });
      }
      await audit(
        tx,
        auth,
        {
          action: 'team.updated',
          entityType: 'team',
          entityId: id,
          changes: {
            before: { name: before.name, memberIds: before.members.map((m) => m.membershipId) },
            after: { ...input, ...(memberIds ? { memberIds } : {}) },
          },
        },
        req.ip,
      );
      return (await this.load(tx, tenantId, id))[0]!;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('people.manage')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    await withTenant(this.db, tenantId, async (tx) => {
      const team = await tx.team.findFirst({ where: { id, tenantId } });
      if (!team) throw new NotFoundException();
      await tx.team.delete({ where: { id } });
      await audit(
        tx,
        auth,
        { action: 'team.deleted', entityType: 'team', entityId: id, changes: { before: { name: team.name } } },
        req.ip,
      );
    });
  }
}
