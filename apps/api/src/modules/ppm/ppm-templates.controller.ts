import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
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
import { withTenant, type Prisma } from '@cafm/db';
import { ppmTaskTemplateSchema, updatePpmTaskTemplateSchema } from '@cafm/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { toTemplate } from './ppm-records';
import { missingTemplate, staleRecord, withPpmWrite } from './ppm-scope';

/** The organisation's maintenance task library: what is done, how long it takes, and the steps to follow. */
@Controller('ppm/templates')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('ppm')
export class PpmTemplatesController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('ppm.read')
  list(@Req() req: Request, @Query('retired') retired?: string) {
    const { tenantId } = req.auth!.membership!;
    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx.ppmTaskTemplate.findMany({
        where: { tenantId, ...(retired === '1' ? {} : { active: true }) },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      const used = await tx.ppmSchedule.groupBy({
        by: ['templateId'],
        where: { tenantId, active: true, templateId: { in: rows.map((row) => row.id) } },
        _count: true,
      });
      const counts = new Map(used.map((row) => [row.templateId, row._count]));
      return rows.map((row) => toTemplate(row, counts.get(row.id) ?? 0));
    });
  }

  @Post()
  @RequirePermission('ppm.manage')
  create(@Req() req: Request, @Body() body: unknown) {
    const input = parse(ppmTaskTemplateSchema, body);
    return withPpmWrite(this.db, req.auth!, 'ppm.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      if (await tx.ppmTaskTemplate.findFirst({ where: { tenantId, name: input.name }, select: { id: true } })) {
        throw new ConflictException('A task with that name already exists.');
      }
      const row = await tx.ppmTaskTemplate.create({
        data: {
          tenantId,
          name: input.name,
          description: input.description ?? null,
          discipline: input.discipline ?? null,
          criticality: input.criticality,
          durationMinutes: input.durationMinutes,
          skills: input.skills ?? null,
          safetyNotes: input.safetyNotes ?? null,
          steps: input.steps as unknown as Prisma.InputJsonValue,
        },
      });
      await audit(
        tx,
        auth,
        {
          action: 'ppm_task_template.create',
          entityType: 'ppm_task_template',
          entityId: row.id,
          changes: { name: row.name, criticality: row.criticality, steps: input.steps.length },
        },
        req.ip,
      );
      return toTemplate(row, 0);
    });
  }

  /** Changing a task changes the jobs raised from now on. Jobs already raised keep the steps they were given. */
  @Put(':id')
  @RequirePermission('ppm.manage')
  update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(updatePpmTaskTemplateSchema, body);
    return withPpmWrite(this.db, req.auth!, 'ppm.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const before = await tx.ppmTaskTemplate.findFirst({ where: { tenantId, id, active: true } });
      if (!before) throw missingTemplate();
      if (before.version !== input.version) throw staleRecord('task');
      const clash = await tx.ppmTaskTemplate.findFirst({
        where: { tenantId, name: input.name, id: { not: id } },
        select: { id: true },
      });
      if (clash) throw new ConflictException('A task with that name already exists.');
      const row = await tx.ppmTaskTemplate.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description ?? null,
          discipline: input.discipline ?? null,
          criticality: input.criticality,
          durationMinutes: input.durationMinutes,
          skills: input.skills ?? null,
          safetyNotes: input.safetyNotes ?? null,
          steps: input.steps as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      await audit(
        tx,
        auth,
        {
          action: 'ppm_task_template.update',
          entityType: 'ppm_task_template',
          entityId: id,
          changes: {
            before: { name: before.name, criticality: before.criticality, durationMinutes: before.durationMinutes },
            after: { name: row.name, criticality: row.criticality, durationMinutes: row.durationMinutes },
            steps: input.steps.length,
          },
        },
        req.ip,
      );
      const schedules = await tx.ppmSchedule.count({ where: { tenantId, templateId: id, active: true } });
      return toTemplate(row, schedules);
    });
  }

  /** A task in use by an active schedule can't be retired. Retiring frees its name. */
  @Delete(':id')
  @RequirePermission('ppm.manage')
  retire(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return withPpmWrite(this.db, req.auth!, 'ppm.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const row = await tx.ppmTaskTemplate.findFirst({ where: { tenantId, id, active: true } });
      if (!row) throw missingTemplate();
      const using = await tx.ppmSchedule.count({ where: { tenantId, templateId: id, active: true } });
      if (using) {
        throw new UnprocessableEntityException(
          `${using} active ${using === 1 ? 'schedule uses' : 'schedules use'} this task. Archive or change ${using === 1 ? 'it' : 'them'} first.`,
        );
      }
      const suffix = ` (retired ${id.slice(-8)})`;
      await tx.ppmTaskTemplate.update({
        where: { id },
        data: { active: false, name: row.name.slice(0, 120 - suffix.length) + suffix, version: { increment: 1 } },
      });
      await audit(
        tx,
        auth,
        {
          action: 'ppm_task_template.retire',
          entityType: 'ppm_task_template',
          entityId: id,
          changes: { name: row.name },
        },
        req.ip,
      );
      return { ok: true };
    });
  }
}
