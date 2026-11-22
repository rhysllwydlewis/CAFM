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
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { validateCustom, type FieldDefinition } from '@cafm/config-engine';
import { withTenant, type Prisma, type Tx } from '@cafm/db';
import {
  createAssetSchema,
  listAssetsSchema,
  updateAssetSchema,
  type AssetAttribute,
  type AssetPage,
  type AssetRecord,
  type AssetSummary,
} from '@cafm/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { activeCustomFields, mergeCustom, nextNumber, visibleCustom } from '../../core/config';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { parse } from '../../core/validation';
import { locationScope } from '../locations/location-tree';
import { assertNoAssetCycle, assetScope, fromSite, locationPaths, siteOf, withAssetWrite } from './asset-scope';

type Row = Prisma.AssetGetPayload<{ include: { class: true } }>;
type Fields = ReadonlyMap<string, FieldDefinition>;

/** The class's attribute template, in the form the validator takes. */
function templateOf(cls: { attributes: Prisma.JsonValue } | null): FieldDefinition[] {
  return ((cls?.attributes ?? []) as unknown as AssetAttribute[]).map((a) => ({
    key: a.key,
    label: a.unit ? `${a.label} (${a.unit})` : a.label,
    type: a.type,
    required: a.required,
    options: a.options ?? null,
    min: a.min ?? null,
    max: a.max ?? null,
    maxLength: null,
  }));
}

/**
 * Validates attribute values against the class template. Values for attributes
 * the template no longer has stay in storage, hidden, like retired custom fields.
 */
function mergeAttributes(
  cls: { attributes: Prisma.JsonValue } | null,
  values: Record<string, unknown>,
  previous?: Prisma.JsonValue,
): Prisma.InputJsonObject {
  const template = templateOf(cls);
  const keys = new Set(template.map((t) => t.key));
  const stored = Object.entries((previous ?? {}) as Prisma.JsonObject);
  const result = validateCustom(template, {
    ...Object.fromEntries(stored.filter(([key]) => keys.has(key))),
    ...values,
  });
  if (!result.success) throw new UnprocessableEntityException({ code: 'invalid_attributes', errors: result.errors });
  return { ...Object.fromEntries(stored.filter(([key]) => !keys.has(key))), ...result.data } as Prisma.InputJsonObject;
}

function visibleAttributes(cls: Row['class'], values: Prisma.JsonValue) {
  const keys = new Set(templateOf(cls).map((t) => t.key));
  return Object.fromEntries(Object.entries((values ?? {}) as Prisma.JsonObject).filter(([key]) => keys.has(key)));
}

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
const toDate = (value: string | null | undefined) => (value ? new Date(`${value}T00:00:00Z`) : value);

/** What an audit event keeps: the fields people edit, never the free-form custom values. */
function auditFields(row: Row) {
  const { number, name, status, locationId, parentId, classId, make, model, serial, supplier, version } = row;
  const { expectedLifeYears, replacementCostMinor, currency, criticality, condition, attributes } = row;
  return {
    number,
    name,
    status,
    locationId,
    parentId,
    classId,
    make,
    model,
    serial,
    supplier,
    installedOn: day(row.installedOn),
    expectedLifeYears,
    replacementCostMinor,
    currency,
    criticality,
    condition,
    attributes,
    version,
  };
}

async function toRecords(tx: Tx, auth: AuthContext, rows: Row[], fields: Fields): Promise<AssetRecord[]> {
  if (!rows.length) return [];
  const paths = await locationPaths(tx, auth, [...new Set(rows.map((row) => row.locationId))]);
  const parentIds = rows.flatMap(({ parentId }) => (parentId ? [parentId] : []));
  const visibleParents = new Set(
    parentIds.length
      ? (await tx.asset.findMany({ where: { ...assetScope(auth), id: { in: parentIds } }, select: { id: true } })).map(
          ({ id }) => id,
        )
      : [],
  );
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    name: row.name,
    status: row.status as AssetRecord['status'],
    locationId: row.locationId,
    locationPath: fromSite(paths.get(row.locationId) ?? []),
    // A parent the member can't see is hidden, as with locations.
    parentId: row.parentId && visibleParents.has(row.parentId) ? row.parentId : null,
    classId: row.classId,
    className: row.class?.name ?? null,
    classGroup: row.class?.group ?? null,
    make: row.make,
    model: row.model,
    serial: row.serial,
    installedOn: day(row.installedOn),
    supplier: row.supplier,
    expectedLifeYears: row.expectedLifeYears,
    replacementCost:
      row.replacementCostMinor === null ? null : { amountMinor: row.replacementCostMinor, currency: row.currency },
    criticality: row.criticality as AssetRecord['criticality'],
    condition: row.condition as AssetRecord['condition'],
    attributes: visibleAttributes(row.class, row.attributes),
    custom: visibleCustom(row.custom, fields),
    version: row.version,
  }));
}

async function requireAsset(tx: Tx, auth: AuthContext, id: string): Promise<Row> {
  const row = await tx.asset.findFirst({ where: { ...assetScope(auth), id }, include: { class: true } });
  if (!row) throw new NotFoundException({ code: 'asset_not_found', message: 'Asset not found.' });
  return row;
}

/** The plan's asset limit counts assets still in use; decommissioned ones free their place. */
async function assertAssetSlot(tx: Tx, auth: AuthContext): Promise<void> {
  const limit = auth.access!.entitlements.limits.assets;
  if (limit === null) return;
  const count = await tx.asset.count({
    where: { tenantId: auth.membership!.tenantId, status: { not: 'decommissioned' } },
  });
  if (count >= limit) {
    throw new ForbiddenException({
      code: 'limit_reached',
      limit,
      message: `Your plan includes ${limit} assets. Decommission some, or ask your Super User about upgrading.`,
    });
  }
}

async function requireClass(tx: Tx, tenantId: string, classId: string) {
  const cls = await tx.assetClass.findFirst({ where: { tenantId, id: classId, active: true } });
  if (!cls) {
    throw new UnprocessableEntityException({ code: 'unknown_asset_class', message: 'Choose an available class.' });
  }
  return cls;
}

/** The asset's location must be inside a site, and a parent must be in the same site. */
async function requireSiteMatch(tx: Tx, tenantId: string, locationId: string, parent: { locationId: string } | null) {
  const site = await siteOf(tx, tenantId, locationId);
  if (!site) {
    throw new UnprocessableEntityException({
      code: 'asset_location_invalid',
      message: 'Choose a location within a site.',
    });
  }
  if (parent && (await siteOf(tx, tenantId, parent.locationId))?.id !== site.id) {
    throw new UnprocessableEntityException({
      code: 'asset_parent_site',
      message: 'A component must be in the same site as its parent.',
    });
  }
  return site;
}

@Controller('assets')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('assets')
export class AssetsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @RequirePermission('assets.read')
  async list(@Query() query: unknown, @Req() req: Request): Promise<AssetPage> {
    const { after, q, limit, locationId, classId, group, status, criticality, condition, parent } = parse(
      listAssetsSchema,
      query,
    );
    // Prisma's contains uses a PostgreSQL LIKE pattern. Search for the text literally.
    const search = q?.replace(/[\\%_]/g, '\\$&');
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const scope = assetScope(auth);
      const and: Prisma.AssetWhereInput[] = [];
      if (locationId) and.push({ location: { ancestors: { some: { ancestorId: locationId } } } });
      if (parent === 'root') and.push({ OR: [{ parentId: null }, { parent: { isNot: scope } }] });
      if (search) {
        const contains = { contains: search, mode: 'insensitive' as const };
        and.push({
          OR: [{ name: contains }, { number: contains }, { serial: contains }, { make: contains }, { model: contains }],
        });
      }
      const rows = await tx.asset.findMany({
        where: {
          ...scope,
          classId,
          status,
          criticality,
          condition,
          class: group ? { is: { group } } : undefined,
          parentId: parent && parent !== 'root' ? parent : undefined,
          id: after ? { gt: after } : undefined,
          AND: and,
        },
        orderBy: { id: 'asc' },
        include: { class: true, _count: { select: { children: { where: { location: scope.location } } } } },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const fields = await activeCustomFields(tx, tenantId, 'asset');
      const records = await toRecords(tx, auth, page, fields);
      return {
        items: records.map((record, index) => ({ ...record, componentCount: page[index]!._count.children })),
        nextCursor: rows.length > limit ? page.at(-1)!.id : null,
        canManage: auth.access!.permissions.has('assets.manage'),
      };
    });
  }

  /** The tiles and classification counts above the register. */
  @Get('summary')
  @RequirePermission('assets.read')
  async summary(@Req() req: Request): Promise<AssetSummary> {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      const live = { ...assetScope(auth), status: { not: 'decommissioned' } };
      const [total, maintainable, conditionCOrD, byClass, classes] = await Promise.all([
        tx.asset.count({ where: live }),
        tx.asset.count({ where: { ...live, status: { in: ['in_service', 'out_of_service', 'alarm'] } } }),
        tx.asset.count({ where: { ...live, condition: { in: ['C', 'D'] } } }),
        tx.asset.groupBy({ by: ['classId'], where: live, _count: { _all: true } }),
        tx.assetClass.findMany({ where: { tenantId: auth.membership!.tenantId }, select: { id: true, group: true } }),
      ]);
      const groupOf = new Map(classes.map((c) => [c.id, c.group]));
      const counts = new Map<string, number>();
      for (const row of byClass) {
        const group = (row.classId && groupOf.get(row.classId)) || 'Unclassified';
        counts.set(group, (counts.get(group) ?? 0) + row._count._all);
      }
      return {
        total,
        maintainable,
        conditionCOrD,
        groups: [...counts].map(([group, count]) => ({ group, count })).sort((a, b) => a.group.localeCompare(b.group)),
      };
    });
  }

  @Get('custom-fields')
  @RequirePermission('assets.read')
  async customFields(@Req() req: Request) {
    const tenantId = req.auth!.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => [...(await activeCustomFields(tx, tenantId, 'asset')).values()]);
  }

  @Get(':id')
  @RequirePermission('assets.read')
  async detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    return withTenant(this.db, tenantId, async (tx) => {
      const row = await requireAsset(tx, auth, id);
      const fields = await activeCustomFields(tx, tenantId, 'asset');
      const [asset] = await toRecords(tx, auth, [row], fields);
      const parent = row.parentId
        ? await tx.asset.findFirst({
            where: { ...assetScope(auth), id: row.parentId },
            select: { id: true, number: true, name: true },
          })
        : null;
      const paths = await locationPaths(tx, auth, [row.locationId]);
      const site = paths.get(row.locationId)?.find((level) => level.kind === 'site') ?? null;
      return {
        ...asset!,
        // The class's attributes, even if the class has since been retired, so the values can be labelled.
        classAttributes: row.class ? ((row.class.attributes ?? []) as unknown as AssetAttribute[]) : [],
        parent,
        site: site && { id: site.id, name: site.name },
        componentCount: await tx.asset.count({ where: { ...assetScope(auth), parentId: row.id } }),
      };
    });
  }

  @Post()
  @RequirePermission('assets.manage')
  async create(@Body() body: unknown, @Req() req: Request) {
    const { replacementCost, installedOn, ...input } = parse(createAssetSchema, body);
    return withAssetWrite(this.db, req.auth!, 'assets.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const location = await tx.location.findFirst({
        where: { ...locationScope(auth), id: input.locationId },
        select: { id: true },
      });
      if (!location) throw new NotFoundException({ code: 'location_not_found', message: 'Location not found.' });
      const parent = input.parentId ? await requireAsset(tx, auth, input.parentId) : null;
      const site = await requireSiteMatch(tx, tenantId, input.locationId, parent);
      const cls = input.classId ? await requireClass(tx, tenantId, input.classId) : null;
      const attributes = mergeAttributes(cls, input.attributes);
      const fields = await activeCustomFields(tx, tenantId, 'asset');
      const custom = mergeCustom(fields, input.custom);
      if (input.status !== 'decommissioned') await assertAssetSlot(tx, auth);
      const number = await nextNumber(tx, tenantId, 'asset', { SITE: site.code });
      const row = await tx.asset.create({
        data: {
          ...input,
          tenantId,
          number,
          installedOn: toDate(installedOn),
          replacementCostMinor: replacementCost?.amountMinor,
          currency: replacementCost?.currency,
          attributes,
          custom,
        },
        include: { class: true },
      });
      await audit(
        tx,
        auth,
        { action: 'asset.created', entityType: 'asset', entityId: row.id, changes: { after: auditFields(row) } },
        req.ip,
      );
      return (await toRecords(tx, auth, [row], fields))[0];
    });
  }

  @Patch(':id')
  @RequirePermission('assets.manage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request) {
    const { version, attributes, custom, replacementCost, installedOn, ...input } = parse(updateAssetSchema, body);
    return withAssetWrite(this.db, req.auth!, 'assets.manage', async (tx, auth) => {
      const tenantId = auth.membership!.tenantId;
      const before = await requireAsset(tx, auth, id);
      if (before.version !== version) {
        throw new ConflictException({ code: 'asset_changed', message: 'Reload this asset and try again.' });
      }

      // Location: stays inside a site. A component must stay in its parent's site, and a system can't leave its components behind.
      const locationId = input.locationId ?? before.locationId;
      if (locationId !== before.locationId) {
        const visible = await tx.location.findFirst({
          where: { ...locationScope(auth), id: locationId },
          select: { id: true },
        });
        if (!visible) throw new NotFoundException({ code: 'location_not_found', message: 'Location not found.' });
      }

      // Parent: visible, same site, no loops. A hidden parent can't be replaced, only left alone.
      let parentId = input.parentId;
      const currentParent = before.parentId
        ? await tx.asset.findFirst({ where: { ...assetScope(auth), id: before.parentId }, select: { id: true } })
        : null;
      if (before.parentId && !currentParent && parentId !== undefined) {
        if (parentId !== null) throw new ForbiddenException();
        parentId = undefined;
      }
      const parentChanged = parentId !== undefined && parentId !== before.parentId;
      // The site rule applies to the real parent even when the member can't see it, so check against that.
      const actualParent = before.parentId
        ? await tx.asset.findFirst({ where: { tenantId, id: before.parentId }, select: { locationId: true } })
        : null;
      const parent = parentChanged ? (parentId ? await requireAsset(tx, auth, parentId) : null) : actualParent;
      const site = await requireSiteMatch(tx, tenantId, locationId, parent);
      if (locationId !== before.locationId) {
        const previousSite = await siteOf(tx, tenantId, before.locationId);
        if (previousSite?.id !== site.id) {
          // Components and "serves" links all stay within one site, so they have to be dealt with first.
          const [components, links] = await Promise.all([
            tx.asset.count({ where: { tenantId, parentId: before.id } }),
            tx.assetServes.count({ where: { tenantId, OR: [{ assetId: before.id }, { servedAssetId: before.id }] } }),
          ]);
          if (components || links) {
            throw new UnprocessableEntityException({
              code: 'asset_site_change',
              message:
                'An asset with components, or that serves or is served by others, can’t move to another site. Move its components and remove those links first.',
            });
          }
        }
      }
      if (parentChanged && parentId) await assertNoAssetCycle(tx, tenantId, before.id, parentId);

      // Class and attributes. Changing the class starts the attributes afresh.
      const classChanged = input.classId !== undefined && input.classId !== before.classId;
      const cls = classChanged
        ? input.classId
          ? await requireClass(tx, tenantId, input.classId)
          : null
        : before.class;
      const nextAttributes =
        classChanged || attributes !== undefined
          ? mergeAttributes(cls, attributes ?? {}, classChanged ? undefined : before.attributes)
          : undefined;

      const fields = await activeCustomFields(tx, tenantId, 'asset');
      const nextCustom = custom === undefined ? undefined : mergeCustom(fields, custom, before.custom);

      // Status: reinstating takes a place on the plan; decommissioning needs the components dealt with first.
      if (input.status && input.status !== before.status) {
        if (before.status === 'decommissioned') await assertAssetSlot(tx, auth);
        if (input.status === 'decommissioned') {
          const live = await tx.asset.count({
            where: { tenantId, parentId: before.id, status: { not: 'decommissioned' } },
          });
          if (live) {
            throw new ConflictException({
              code: 'asset_has_components',
              message: 'Decommission this asset’s components first.',
            });
          }
        }
      }

      const updated = await tx.asset.update({
        where: { id: before.id },
        data: {
          ...input,
          locationId,
          parentId,
          installedOn: toDate(installedOn),
          ...(replacementCost === undefined
            ? {}
            : replacementCost === null
              ? { replacementCostMinor: null }
              : { replacementCostMinor: replacementCost.amountMinor, currency: replacementCost.currency }),
          attributes: nextAttributes,
          custom: nextCustom,
          version: { increment: 1 },
        },
        include: { class: true },
      });
      await audit(
        tx,
        auth,
        {
          action:
            updated.status === 'decommissioned' && before.status !== 'decommissioned'
              ? 'asset.decommissioned'
              : 'asset.updated',
          entityType: 'asset',
          entityId: before.id,
          changes: {
            before: auditFields(before),
            after: auditFields(updated),
            ...(custom ? { customFields: Object.keys(custom) } : {}),
          },
        },
        req.ip,
      );
      return (await toRecords(tx, auth, [updated], fields))[0];
    });
  }
}
