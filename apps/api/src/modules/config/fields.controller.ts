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
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ENTITY_TYPES, fieldDefinitionInput, validateCustom } from '@fmstead/config-engine';
import { Prisma, type Tx, withTenant } from '@fmstead/db';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { recordVersion, toFieldDefinition } from '../../core/config';
import type { Access } from '../../core/session';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';

const KIND = 'field_definition';
const updateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  required: z.boolean().optional(),
  helpText: z.string().trim().max(300).nullable().optional(),
  options: z
    .array(z.object({ value: z.string().trim().min(1).max(64), label: z.string().trim().min(1).max(120) }))
    .max(200)
    .optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  maxLength: z.number().int().positive().max(10000).nullable().optional(),
  position: z.number().int().min(0).max(1000).optional(),
});
const validateSchema = z.object({ entityType: z.enum(ENTITY_TYPES), values: z.record(z.string(), z.unknown()) });

type Row = Prisma.FieldDefinitionGetPayload<object>;

/** The data kept in each version: everything an administrator can change. */
function snapshot(r: Row): Prisma.InputJsonValue {
  const { id: _id, tenantId: _t, createdAt: _c, updatedAt: _u, ...rest } = r;
  return rest as unknown as Prisma.InputJsonValue;
}

/** Plan limit on active custom fields (doc 07): 5 Free, 25 Starter, unlimited above. */
async function assertFieldSlot(tx: Tx, access: Access, tenantId: string): Promise<void> {
  const limit = access.entitlements.limits.custom_fields;
  if (limit === null) return;
  // One at a time per tenant, so parallel requests can't overshoot the limit.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`custom_fields:${tenantId}`}))`;
  if ((await tx.fieldDefinition.count({ where: { tenantId, active: true } })) >= limit) {
    throw new ForbiddenException({
      code: 'limit_reached',
      limit,
      message: `Your plan includes ${limit} custom fields. Deactivate one, or ask your Super User about upgrading.`,
    });
  }
}

/** Custom fields on every entity (doc 02 § 0, ADR 0003). */
@Controller('config/fields')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('custom_fields')
export class FieldsController {
  constructor(private readonly db: PrismaService) {}

  /** Active fields for an entity type: every member needs these to fill in forms. */
  @Get()
  async list(@Req() req: Request, @Query('entityType') entityType?: string) {
    const tenantId = req.auth!.membership!.tenantId;
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx.fieldDefinition.findMany({
        where: { tenantId, active: true, ...(entityType ? { entityType } : {}) },
        orderBy: [{ entityType: 'asc' }, { position: 'asc' }, { label: 'asc' }],
      }),
    );
    return rows.map(toFieldDefinition);
  }

  /** Every field including deactivated ones, with the plan limit: the administration screen. */
  @Get('all')
  @RequirePermission('settings.manage')
  async listAll(@Req() req: Request) {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx.fieldDefinition.findMany({
        where: { tenantId },
        orderBy: [{ entityType: 'asc' }, { position: 'asc' }, { label: 'asc' }],
      }),
    );
    return {
      fields: rows.map(toFieldDefinition),
      limit: auth.access!.entitlements.limits.custom_fields,
    };
  }

  /** Validates an entity's custom values against the active definitions. */
  @Post('validate')
  @HttpCode(200)
  async validate(@Body() body: unknown, @Req() req: Request) {
    const input = parse(validateSchema, body);
    const tenantId = req.auth!.membership!.tenantId;
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx.fieldDefinition.findMany({ where: { tenantId, entityType: input.entityType, active: true } }),
    );
    const result = validateCustom(rows.map(toFieldDefinition), input.values);
    if (!result.success)
      throw new UnprocessableEntityException({ code: 'invalid_custom_fields', errors: result.errors });
    return { values: result.data };
  }

  @Post()
  @RequirePermission('settings.manage')
  async create(@Body() body: unknown, @Req() req: Request) {
    const input = parse(fieldDefinitionInput, body);
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      await assertFieldSlot(tx, auth.access!, tenantId);
      if (
        await tx.fieldDefinition.findUnique({
          where: { tenantId_entityType_key: { tenantId, entityType: input.entityType, key: input.key } },
        })
      ) {
        throw new ConflictException({
          code: 'field_exists',
          message: 'A field with that key already exists on this record type.',
        });
      }
      const row = await tx.fieldDefinition.create({
        data: { ...input, tenantId, options: input.options ?? Prisma.JsonNull },
      });
      const version = await recordVersion(tx, auth, KIND, row.id, snapshot(row));
      await audit(
        tx,
        auth,
        { action: 'field.created', entityType: KIND, entityId: row.id, changes: { after: snapshot(row), version } },
        req.ip,
      );
      return toFieldDefinition(row);
    });
  }

  @Patch(':id')
  @RequirePermission('settings.manage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request) {
    const input = parse(updateSchema, body);
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const before = await tx.fieldDefinition.findFirst({ where: { id, tenantId } });
      if (!before) throw new NotFoundException();
      // Re-check the whole definition with the change applied (e.g. a pick list keeps its options).
      const definition = toFieldDefinition(before);
      const merged = { ...definition, ...input, options: input.options ?? definition.options ?? undefined };
      const check = fieldDefinitionInput.safeParse({
        ...merged,
        helpText: merged.helpText ?? undefined,
        min: merged.min ?? undefined,
        max: merged.max ?? undefined,
        maxLength: merged.maxLength ?? undefined,
      });
      if (!check.success) throw new UnprocessableEntityException(check.error.issues.map((i) => i.message));
      const row = await tx.fieldDefinition.update({
        where: { id },
        data: { ...input, ...(input.options ? { options: input.options } : {}) },
      });
      const version = await recordVersion(tx, auth, KIND, id, snapshot(row));
      await audit(
        tx,
        auth,
        {
          action: 'field.updated',
          entityType: KIND,
          entityId: id,
          changes: { before: snapshot(before), after: snapshot(row), version },
        },
        req.ip,
      );
      return toFieldDefinition(row);
    });
  }

  /** Deactivates rather than deletes, so existing values and history stay readable. */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('settings.manage')
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    await withTenant(this.db, tenantId, async (tx) => {
      const before = await tx.fieldDefinition.findFirst({ where: { id, tenantId, active: true } });
      if (!before) throw new NotFoundException();
      const row = await tx.fieldDefinition.update({ where: { id }, data: { active: false } });
      const version = await recordVersion(tx, auth, KIND, id, snapshot(row));
      await audit(
        tx,
        auth,
        { action: 'field.deactivated', entityType: KIND, entityId: id, changes: { version } },
        req.ip,
      );
    });
  }

  @Get(':id/versions')
  @RequirePermission('settings.manage')
  async versions(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const tenantId = req.auth!.membership!.tenantId;
    return withTenant(this.db, tenantId, (tx) =>
      tx.configVersion.findMany({ where: { tenantId, kind: KIND, entityId: id }, orderBy: { version: 'desc' } }),
    );
  }

  /** Puts a field back as it was at an earlier version. The rollback is itself a new version. */
  @Post(':id/rollback')
  @HttpCode(200)
  @RequirePermission('settings.manage')
  async rollback(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request) {
    const { version } = parse(z.object({ version: z.number().int().positive() }), body);
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const target = await tx.configVersion.findFirst({ where: { tenantId, kind: KIND, entityId: id, version } });
      if (!target) throw new NotFoundException({ code: 'version_not_found' });
      const data = target.data as Record<string, unknown>;
      const current = await tx.fieldDefinition.findFirst({ where: { id, tenantId } });
      if (!current) throw new NotFoundException();
      // Bringing a deactivated field back takes a slot on the plan, like creating one.
      if (data.active === true && !current.active) await assertFieldSlot(tx, auth.access!, tenantId);
      const row = await tx.fieldDefinition.update({
        where: { id },
        data: {
          label: data.label as string,
          required: data.required as boolean,
          helpText: (data.helpText as string | null) ?? null,
          options: (data.options as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
          min: (data.min as number | null) ?? null,
          max: (data.max as number | null) ?? null,
          maxLength: (data.maxLength as number | null) ?? null,
          position: data.position as number,
          active: data.active as boolean,
        },
      });
      const newVersion = await recordVersion(tx, auth, KIND, id, snapshot(row));
      await audit(
        tx,
        auth,
        {
          action: 'field.rolled_back',
          entityType: KIND,
          entityId: id,
          changes: { toVersion: version, version: newVersion },
        },
        req.ip,
      );
      return toFieldDefinition(row);
    });
  }
}
