import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { validateCustom, type FieldDefinition } from '@cafm/config-engine';
import { withTenant, type Prisma, type Tx } from '@cafm/db';
import { createLocationSchema, listLocationsSchema, locationAccessSchema, updateLocationSchema } from '@cafm/shared';
import { assertCanGrant, assertNotDemoLocked } from '../../core/access-rules';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { toFieldDefinition } from '../../core/config';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { parse } from '../../core/validation';
import {
  addLocationPaths,
  allLocations,
  assertLocationParent,
  locationScope,
  moveLocationPaths,
  withLocationWrite,
} from './location-tree';

type Location = Prisma.LocationGetPayload<object>;
type LocationFields = ReadonlyMap<string, FieldDefinition>;

async function activeFields(tx: Tx, tenantId: string): Promise<LocationFields> {
  const rows = await tx.fieldDefinition.findMany({ where: { tenantId, entityType: 'location', active: true } });
  return new Map(rows.map((row) => [row.key, toFieldDefinition(row)]));
}

function customEntries(values: Prisma.JsonValue | undefined) {
  return Object.entries((values ?? {}) as Prisma.JsonObject);
}

function activeValues(values: Prisma.JsonValue | undefined, fields: LocationFields) {
  return Object.fromEntries(customEntries(values).filter(([key]) => fields.has(key)));
}

function publicFields(row: Location, fields: LocationFields) {
  const { id, name, code, kind, status, parentId, version, custom } = row;
  return { id, name, code, kind, status, parentId, version, custom: activeValues(custom, fields) };
}

function auditFields(row: Location) {
  const { name, code, kind, status, parentId, version } = row;
  return { name, code, kind, status, parentId, version };
}

async function visibleLocations(tx: Tx, auth: AuthContext, rows: Location[], fields?: LocationFields) {
  if (!rows.length) return [];
  const definitions = fields ?? (await activeFields(tx, auth.membership!.tenantId));
  if (allLocations(auth)) return rows.map((row) => publicFields(row, definitions));
  const ids = rows.flatMap(({ parentId }) => (parentId ? [parentId] : []));
  const parents = new Set(
    (
      await tx.location.findMany({
        where: { ...locationScope(auth), id: { in: ids } },
        select: { id: true },
      })
    ).map(({ id }) => id),
  );
  return rows.map((row) =>
    publicFields({ ...row, parentId: row.parentId && parents.has(row.parentId) ? row.parentId : null }, definitions),
  );
}

async function requireLocation(tx: Tx, auth: AuthContext, id: string): Promise<Location> {
  const row = await tx.location.findFirst({ where: { ...locationScope(auth), id } });
  if (!row) throw new NotFoundException({ code: 'location_not_found', message: 'Location not found.' });
  return row;
}

function locationCustom(fields: LocationFields, values: Record<string, unknown>, previous?: Prisma.JsonValue) {
  const result = validateCustom([...fields.values()], { ...activeValues(previous, fields), ...values });
  if (!result.success) throw new UnprocessableEntityException({ code: 'invalid_custom_fields', errors: result.errors });
  const inactive = Object.fromEntries(customEntries(previous).filter(([key]) => !fields.has(key)));
  return { ...inactive, ...result.data } as Prisma.InputJsonObject;
}

async function requireAvailableCode(tx: Tx, tenantId: string, code: string) {
  if (await tx.location.findUnique({ where: { tenantId_code: { tenantId, code } }, select: { id: true } })) {
    throw new ConflictException({ code: 'location_code_exists', message: 'Choose a unique location code.' });
  }
}

@Controller('locations')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('locations')
export class LocationsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('locations.read')
  async list(@Query() query: unknown, @Req() req: Request) {
    const { after, q, limit, kind } = parse(listLocationsSchema, query);
    // Prisma's contains uses a PostgreSQL LIKE pattern. Search for the text literally.
    const search = q?.replace(/[\\%_]/g, '\\$&');
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const rows = await tx.location.findMany({
        where: {
          ...locationScope(auth),
          kind,
          id: after ? { gt: after } : undefined,
          OR: search
            ? [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }]
            : undefined,
        },
        orderBy: { id: 'asc' },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return {
        items: await visibleLocations(tx, auth, page),
        nextCursor: rows.length > limit ? page.at(-1)!.id : null,
      };
    });
  }

  @Get(':id')
  @RequirePermission('locations.read')
  async detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const row = await requireLocation(tx, auth, id);
      const [location] = await visibleLocations(tx, auth, [row]);
      return location;
    });
  }

  @Post()
  @RequirePermission('locations.manage')
  async create(@Body() body: unknown, @Req() req: Request) {
    const input = parse(createLocationSchema, body);
    return withLocationWrite(this.db, req.auth!, 'locations.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      if ((!input.parentId || input.kind === 'site') && !allLocations(auth)) throw new ForbiddenException();
      if (input.parentId) await requireLocation(tx, auth, input.parentId);
      await assertLocationParent(tx, tenantId, input.kind, input.parentId);
      const limit = auth.access!.entitlements.limits.sites;
      if (
        input.kind === 'site' &&
        limit !== null &&
        (await tx.location.count({ where: { tenantId, kind: 'site' } })) >= limit
      ) {
        throw new ForbiddenException({ code: 'limit_reached', limit, message: `Your plan includes ${limit} sites.` });
      }
      await requireAvailableCode(tx, tenantId, input.code);
      const fields = await activeFields(tx, tenantId);
      const custom = locationCustom(fields, input.custom);
      const row = await tx.location.create({ data: { ...input, tenantId, custom } });
      await addLocationPaths(tx, tenantId, row.id, row.parentId);
      await audit(
        tx,
        auth,
        { action: 'location.created', entityType: 'location', entityId: row.id, changes: { after: auditFields(row) } },
        req.ip,
      );
      return publicFields(row, fields);
    });
  }

  @Patch(':id')
  @RequirePermission('locations.manage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request) {
    const { version, custom, parentId: requestedParent, ...input } = parse(updateLocationSchema, body);
    return withLocationWrite(this.db, req.auth!, 'locations.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const before = await requireLocation(tx, auth, id);
      if (before.version !== version)
        throw new ConflictException({ code: 'location_changed', message: 'Reload this location and try again.' });
      let parentId = requestedParent;
      if (parentId !== undefined && parentId !== before.parentId) {
        if (allLocations(auth)) {
          if (parentId) await requireLocation(tx, auth, parentId);
          await assertLocationParent(tx, tenantId, before.kind, parentId);
          await moveLocationPaths(tx, tenantId, before.id, parentId);
        } else {
          const visibleParent =
            before.parentId &&
            (await tx.location.findFirst({
              where: { ...locationScope(auth), id: before.parentId },
              select: { id: true },
            }));
          if (parentId !== null || visibleParent) throw new ForbiddenException();
          // A hidden parent is null in a scoped response. Keep the real link on save.
          parentId = undefined;
        }
      }
      if (input.code !== undefined && input.code !== before.code) await requireAvailableCode(tx, tenantId, input.code);
      const fields = await activeFields(tx, tenantId);
      const updated = await tx.location.update({
        where: { id: before.id },
        data: {
          ...input,
          parentId,
          custom: custom === undefined ? undefined : locationCustom(fields, custom, before.custom),
          version: { increment: 1 },
        },
      });
      await audit(
        tx,
        auth,
        {
          action: 'location.updated',
          entityType: 'location',
          entityId: before.id,
          changes: {
            before: auditFields(before),
            after: auditFields(updated),
            ...(custom ? { customFields: Object.keys(custom) } : {}),
          },
        },
        req.ip,
      );
      const [location] = await visibleLocations(tx, auth, [updated], fields);
      return location;
    });
  }

  @Put('access/:membershipId')
  @RequirePermission('people.manage')
  async setAccess(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const { locationIds } = parse(locationAccessSchema, body);
    return withLocationWrite(this.db, req.auth!, 'people.manage', async (tx, auth) => {
      const actor = auth.membership!;
      const tenantId = actor.tenantId;
      if (
        !auth.access!.permissions.has('locations.manage') ||
        !allLocations(auth) ||
        membershipId.toLowerCase() === actor.id
      )
        throw new ForbiddenException();
      const member = await tx.membership.findFirst({
        where: { tenantId, id: membershipId },
        include: { account: { select: { isDemo: true } } },
      });
      if (!member) throw new NotFoundException();
      if (member.role === 'super_user') throw new ForbiddenException();
      assertNotDemoLocked(member.account.isDemo);
      const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: member.role } } });
      if (!role) throw new ForbiddenException();
      assertCanGrant(auth.access!, actor.role, role.permissions);
      const ids = [...new Set(locationIds ?? [])];
      if ((await tx.location.count({ where: { tenantId, id: { in: ids } } })) !== ids.length)
        throw new NotFoundException();
      const where = { tenantId, membershipId: member.id };
      const before = await tx.membershipSite.findMany({ where, select: { locationId: true } });
      await tx.membershipSite.deleteMany({ where });
      await tx.membershipSite.createMany({ data: ids.map((locationId) => ({ ...where, locationId })) });
      await tx.membership.update({ where: { id: member.id }, data: { locationScoped: locationIds !== null } });
      await audit(
        tx,
        auth,
        {
          action: 'location.access_updated',
          entityType: 'membership',
          entityId: member.id,
          changes: {
            before: { restricted: member.locationScoped, locationIds: before.map(({ locationId }) => locationId) },
            after: { restricted: locationIds !== null, locationIds: ids },
          },
        },
        req.ip,
      );
      return { membershipId: member.id, locationIds: locationIds === null ? null : ids };
    });
  }
}
