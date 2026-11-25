import {
  BadRequestException,
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
  Res,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { validateCustom, type FieldDefinition } from '@cafm/config-engine';
import { withTenant, type Prisma, type Tx } from '@cafm/db';
import {
  createLocationSchema,
  listLocationsSchema,
  locationAccessSchema,
  TOP_LEVEL_KINDS,
  updateLocationSchema,
  type LocationDetail,
  type LocationRecord,
  type LocationPage,
} from '@cafm/shared';
import { assertCanGrant, assertNotDemoLocked } from '../../core/access-rules';
import { assertAdministrable } from '../../core/delegation';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { toFieldDefinition } from '../../core/config';
import { toCsv } from '../../core/csv';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { parse } from '../../core/validation';
import {
  addLocationPaths,
  allLocations,
  assertLocationParent,
  locationScope,
  moveLocationPaths,
  visibleAncestors,
  withLocationWrite,
} from './location-tree';

type Location = Prisma.LocationGetPayload<object>;
type LocationFields = ReadonlyMap<string, FieldDefinition>;

/** Exports stop here so one request cannot read an unbounded estate. */
const EXPORT_LIMIT = 5000;

async function activeFields(tx: Tx, tenantId: string): Promise<LocationFields> {
  const rows = await tx.fieldDefinition.findMany({
    where: { tenantId, entityType: 'location', active: true },
    orderBy: [{ position: 'asc' }, { label: 'asc' }],
  });
  return new Map(rows.map((row) => [row.key, toFieldDefinition(row)]));
}

function customEntries(values: Prisma.JsonValue | undefined) {
  return Object.entries((values ?? {}) as Prisma.JsonObject);
}

function activeValues(values: Prisma.JsonValue | undefined, fields: LocationFields) {
  return Object.fromEntries(customEntries(values).filter(([key]) => fields.has(key)));
}

function publicFields(row: Location, fields: LocationFields, includeAccess = false): LocationRecord {
  const { id, name, code, kind, status, parentId, version, custom, details, siteCalendar } = row;
  return {
    id,
    name,
    code,
    parentId,
    version,
    kind: kind as LocationRecord['kind'],
    status: status as LocationRecord['status'],
    custom: activeValues(custom, fields),
    details: details as LocationRecord['details'],
    siteCalendar: siteCalendar as LocationRecord['siteCalendar'],
    ...(includeAccess ? { restrictedAccess: row.restrictedAccess } : {}),
  };
}

function auditFields(row: Location) {
  const { name, code, kind, status, parentId, version, details, siteCalendar } = row;
  return { name, code, kind, status, parentId, version, details, siteCalendar };
}

async function visibleLocations(
  tx: Tx,
  auth: AuthContext,
  rows: Location[],
  fields?: LocationFields,
  accessDetails = false,
) {
  if (!rows.length) return [];
  const definitions = fields ?? (await activeFields(tx, auth.membership!.tenantId));
  const includeAccess = accessDetails && auth.access!.permissions.has('locations.manage');
  if (allLocations(auth)) return rows.map((row) => publicFields(row, definitions, includeAccess));
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
    publicFields(
      { ...row, parentId: row.parentId && parents.has(row.parentId) ? row.parentId : null },
      definitions,
      includeAccess,
    ),
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
  async list(@Query() query: unknown, @Req() req: Request): Promise<LocationPage> {
    const { after, q, limit, kind, status, parent } = parse(listLocationsSchema, query);
    // Prisma's contains uses a PostgreSQL LIKE pattern. Search for the text literally.
    const search = q?.replace(/[\\%_]/g, '\\$&');
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const scope = locationScope(auth);
      // Pages follow name order, with the id as the tie-breaker so equal names never skip or repeat.
      const cursor = after
        ? await tx.location.findFirst({ where: { ...scope, id: after }, select: { id: true, name: true } })
        : null;
      if (after && !cursor) throw new BadRequestException({ code: 'invalid_cursor', message: 'Start the list again.' });
      const rows = await tx.location.findMany({
        where: {
          ...scope,
          kind,
          status,
          ...(parent === 'root' ? {} : { parentId: parent }),
          AND: [
            ...(parent === 'root' ? [{ OR: [{ parentId: null }, { parent: { isNot: scope } }] }] : []),
            ...(cursor ? [{ OR: [{ name: { gt: cursor.name } }, { name: cursor.name, id: { gt: cursor.id } }] }] : []),
          ],
          OR: search
            ? [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }]
            : undefined,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        include: { _count: { select: { children: { where: scope } } } },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return {
        items: (await visibleLocations(tx, auth, page)).map((item, index) => ({
          ...item,
          hasChildren: page[index]!._count.children > 0,
        })),
        canManageHierarchy: allLocations(auth) && auth.access!.permissions.has('locations.manage'),
        nextCursor: rows.length > limit ? page.at(-1)!.id : null,
      };
    });
  }

  @Get('export')
  @RequirePermission('locations.read')
  async exportCsv(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const csv = await withTenant(this.db, tenantId, async (tx) => {
      const [rows, fields] = await Promise.all([
        tx.location.findMany({
          where: locationScope(auth),
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take: EXPORT_LIMIT,
          include: { parent: { select: { code: true } } },
        }),
        activeFields(tx, tenantId),
      ]);
      // A parent can sit beyond the row cap, so check it against the member's scope directly.
      const visible = new Set(rows.map(({ id }) => id));
      const missing = [
        ...new Set(rows.flatMap(({ parentId }) => (parentId && !visible.has(parentId) ? [parentId] : []))),
      ];
      if (missing.length) {
        const found = await tx.location.findMany({
          where: { AND: [locationScope(auth), { id: { in: missing } }] },
          select: { id: true },
        });
        for (const { id } of found) visible.add(id);
      }
      const keys = [...fields.keys()];
      const out = toCsv(
        [
          'code',
          'name',
          'kind',
          'status',
          'parent_code',
          'address',
          'use_class',
          'gross_area',
          'net_area',
          ...keys.map((key) => `custom.${key}`),
        ],
        rows.map((row) => {
          const detail = (row.details ?? {}) as LocationRecord['details'] & Record<string, unknown>;
          const custom = activeValues(row.custom, fields) as Record<string, unknown>;
          return [
            row.code,
            row.name,
            row.kind,
            row.status,
            row.parentId && visible.has(row.parentId) ? row.parent?.code : '',
            detail?.address,
            detail?.useClass,
            detail?.grossArea,
            detail?.netArea,
            ...keys.map((key) => custom[key]),
          ];
        }),
      );
      await audit(
        tx,
        auth,
        { action: 'location.exported', entityType: 'location', entityId: tenantId, changes: { rows: rows.length } },
        req.ip,
      );
      return out;
    });
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="locations.csv"',
      'Cache-Control': 'no-store',
    });
    return csv;
  }

  @Get('custom-fields')
  @RequirePermission('locations.read')
  async customFields(@Req() req: Request) {
    const tenantId = req.auth!.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => [...(await activeFields(tx, tenantId)).values()]);
  }

  @Get(':id')
  @RequirePermission('locations.read')
  async detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<LocationDetail> {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const row = await requireLocation(tx, auth, id);
      const [[location], path] = await Promise.all([
        visibleLocations(tx, auth, [row], undefined, true),
        visibleAncestors(tx, auth, row.id, row.parentId),
      ]);
      return { ...location!, path };
    });
  }

  @Post()
  @RequirePermission('locations.manage')
  async create(@Body() body: unknown, @Req() req: Request) {
    const input = parse(createLocationSchema, body);
    return withLocationWrite(this.db, req.auth!, 'locations.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      // Organisation-wide managers shape the top of the estate. The screens hide these levels from scoped managers too.
      if ((!input.parentId || TOP_LEVEL_KINDS.includes(input.kind)) && !allLocations(auth))
        throw new ForbiddenException();
      if (input.parentId) await requireLocation(tx, auth, input.parentId);
      await assertLocationParent(tx, tenantId, input.kind, input.parentId);
      if (input.siteCalendar && input.kind !== 'site')
        throw new UnprocessableEntityException('Choose a site for this calendar.');
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
      return publicFields(row, fields, true);
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
      if (input.siteCalendar && before.kind !== 'site')
        throw new UnprocessableEntityException('Choose a site for this calendar.');
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
            ...(input.restrictedAccess !== undefined ? { restrictedAccessChanged: true } : {}),
            ...(custom ? { customFields: Object.keys(custom) } : {}),
          },
        },
        req.ip,
      );
      const [location] = await visibleLocations(tx, auth, [updated], fields, true);
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
      if (membershipId.toLowerCase() === actor.id) throw new ForbiddenException();
      // Delegated admins (limited to sites) may only narrow or move someone within their own sites.
      const delegated = !allLocations(auth);
      if (delegated ? locationIds === null : !auth.access!.permissions.has('locations.manage'))
        throw new ForbiddenException();
      const member = await tx.membership.findFirst({
        where: { tenantId, id: membershipId },
        include: { account: { select: { isDemo: true } } },
      });
      if (!member) throw new NotFoundException();
      await assertAdministrable(tx, auth, member.id);
      if (member.role === 'super_user') throw new ForbiddenException();
      assertNotDemoLocked(member.account.isDemo);
      const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key: member.role } } });
      if (!role) throw new ForbiddenException();
      assertCanGrant(auth.access!, actor.role, role.permissions);
      const ids = [...new Set(locationIds ?? [])];
      if ((await tx.location.count({ where: { ...locationScope(auth), id: { in: ids } } })) !== ids.length)
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
