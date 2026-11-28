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
import { withTenant, type Tx } from '@fmstead/db';
import { createTeamSchema, updateTeamSchema, type Team } from '@fmstead/shared';
import { administrableMembers, assertNotSiteLimited } from '../../core/delegation';
import { audit } from '../../core/audit';
import type { AuthContext } from '../../core/session';
import { PermissionGuard, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { dataScope, visibleMembers } from '../../core/data-scope';

const teamExists = () =>
  new ConflictException({ code: 'team_exists', message: 'A team with that name already exists.' });

/** Team names are compared without regard to case, so "North Region" and "north region" are one team. */
async function assertNameFree(tx: Tx, tenantId: string, name: string, exceptId?: string): Promise<void> {
  const clash = await tx.team.findFirst({
    where: { tenantId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw teamExists();
}

/** Two requests with the same name at once: the unique index decides, and the loser is told so. */
const onDuplicateName = (error: unknown): never => {
  if ((error as { code?: string }).code === 'P2002') throw teamExists();
  throw error;
};

/** Teams and groups inside the current organisation (doc 03), used for assignment and scoping. */
@Controller('teams')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
export class TeamsController {
  constructor(private readonly db: PrismaService) {}

  /**
   * Teams with their members. A role whose data scope is "own" sees only itself among the members, and "team"
   * only itself and its teammates, as in the people list, so teams are not a way round people visibility.
   */
  private async load(tx: Tx, auth: AuthContext, id?: string, scoped = true): Promise<Team[]> {
    const tenantId = auth.membership!.tenantId;
    const limited = scoped && dataScope(auth) !== 'all';
    // The same site limit as the people lists, so teams are not a way round it.
    const allowed = scoped ? await administrableMembers(tx, auth) : null;
    const sites = allowed ? { id: { in: [...allowed, auth.membership!.id] } } : {};
    const [teams, roles] = await Promise.all([
      tx.team.findMany({
        where: { tenantId, ...(id ? { id } : {}) },
        include: {
          members: {
            where: { membership: { AND: [limited ? visibleMembers(auth) : {}, sites] } },
            include: { membership: { include: { account: true } } },
          },
        },
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

  /** Members must be active people here. Someone already in the team (`keep`) may stay after being deactivated. */
  private async assertMembers(tx: Tx, tenantId: string, ids: string[], keep: string[] = []): Promise<string[]> {
    const unique = [...new Set(ids)];
    const found = await tx.membership.count({
      where: { tenantId, id: { in: unique }, OR: [{ status: 'active' }, { id: { in: keep } }] },
    });
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
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, (tx) => this.load(tx, auth));
  }

  @Post()
  @RequirePermission('people.manage')
  async create(@Body() body: unknown, @Req() req: Request): Promise<Team> {
    const input = parse(createTeamSchema, body);
    const auth = req.auth!;
    assertNotSiteLimited(auth);
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      await assertNameFree(tx, tenantId, input.name);
      const memberIds = await this.assertMembers(tx, tenantId, input.memberIds);
      const team = await tx.team
        .create({
          data: {
            tenantId,
            name: input.name,
            description: input.description,
          },
        })
        .catch(onDuplicateName);
      await tx.teamMember.createMany({
        data: memberIds.map((membershipId) => ({ tenantId, teamId: team.id, membershipId })),
      });
      await audit(
        tx,
        auth,
        { action: 'team.created', entityType: 'team', entityId: team.id, changes: { after: { ...input, memberIds } } },
        req.ip,
      );
      return (await this.load(tx, auth, team.id))[0]!;
    });
  }

  @Patch(':id')
  @RequirePermission('people.manage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request): Promise<Team> {
    const input = parse(updateTeamSchema, body);
    const auth = req.auth!;
    assertNotSiteLimited(auth);
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const [before] = await this.load(tx, auth, id, false);
      if (!before) throw new NotFoundException();
      if (input.name) await assertNameFree(tx, tenantId, input.name, id);
      await tx.team
        .update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
          },
        })
        .catch(onDuplicateName);
      let memberIds: string[] | undefined;
      if (input.memberIds) {
        memberIds = await this.assertMembers(
          tx,
          tenantId,
          input.memberIds,
          before.members.map((m) => m.membershipId),
        );
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
      return (await this.load(tx, auth, id))[0]!;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('people.manage')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    const auth = req.auth!;
    assertNotSiteLimited(auth);
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
