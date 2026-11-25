import { validateCustom, type FieldDefinition } from '@cafm/config-engine';
import type { Prisma, Tx } from '@cafm/db';
import { ASSET_CONDITIONS, ASSET_CRITICALITIES, ASSET_STATUSES, createAssetSchema } from '@cafm/shared';
import { CsvError, parseCsv } from '../../core/csv-parse';
import { coerceCustomCell, customKey, IMPORT_MAX_ROWS, type ImportIssue } from '../../core/import-fields';
import { assetScope } from './asset-scope';
import { templateOf } from './assets.controller';
import type { AuthContext } from '../../core/session';
import { locationScope } from '../locations/location-tree';

/** Columns in the order the template uses. `ref` names a row so other rows can use it as their parent. */
export const ASSET_COLUMNS = [
  'ref',
  'name',
  'location_code',
  'parent',
  'class',
  'status',
  'make',
  'model',
  'serial',
  'installed_on',
  'supplier',
  'expected_life_years',
  'replacement_cost_minor',
  'currency',
  'criticality',
  'condition',
] as const;
const REQUIRED = ['name', 'location_code'] as const;

const SCHEMA_COLUMN: Record<string, string> = {
  name: 'name',
  status: 'status',
  make: 'make',
  model: 'model',
  serial: 'serial',
  installedOn: 'installed_on',
  supplier: 'supplier',
  expectedLifeYears: 'expected_life_years',
  replacementCost: 'replacement_cost_minor',
  criticality: 'criticality',
  condition: 'condition',
};

/** Stands in for the location and parent while a row is checked. The real ones are looked up afterwards. */
const PLACEHOLDER = '00000000-0000-4000-8000-000000000000';
const ATTR = 'attr.';

export interface PlannedAsset {
  row: number;
  ref: string;
  name: string;
  locationId: string;
  siteId: string;
  siteCode: string;
  /** A row in the file (by `ref`) or an asset that already exists (by number). */
  parent: string | null;
  classId: string | null;
  className: string | null;
  data: {
    status: string;
    make?: string | null;
    model?: string | null;
    serial?: string | null;
    installedOn?: string | null;
    supplier?: string | null;
    expectedLifeYears?: number | null;
    replacementCostMinor: number | null;
    currency: string;
    criticality: string;
    condition?: string | null;
  };
  attributes: Prisma.InputJsonObject;
  custom: Prisma.InputJsonObject;
}

export interface AssetPlan {
  /** Parents come before their components. */
  ordered: PlannedAsset[];
  issues: ImportIssue[];
  /** Existing assets named as a parent, by number. */
  existingParents: Map<string, string>;
}

const empty = (issues: ImportIssue[]): AssetPlan => ({ ordered: [], existingParents: new Map(), issues });

export function assetTemplate(fields: Iterable<string>): string {
  return [...ASSET_COLUMNS, ...[...fields].map((key) => `custom.${key}`)].join(',');
}

function attributeKeys(classes: { attributes: Prisma.JsonValue }[]): Set<string> {
  return new Set(classes.flatMap((cls) => templateOf(cls).map(({ key }) => key)));
}

export async function planAssetImport(
  tx: Tx,
  auth: AuthContext,
  csv: string,
  fields: ReadonlyMap<string, FieldDefinition>,
): Promise<AssetPlan> {
  const tenantId = auth.membership!.tenantId;
  let parsed;
  try {
    parsed = parseCsv(csv, IMPORT_MAX_ROWS);
  } catch (error) {
    if (error instanceof CsvError) return empty([{ row: 1, column: '', message: error.message }]);
    throw error;
  }
  const { header, rows, lines } = parsed;
  const classes = await tx.assetClass.findMany({ where: { tenantId, active: true } });
  const attrKeys = attributeKeys(classes);
  const known = new Set<string>([
    ...ASSET_COLUMNS,
    ...[...fields.keys()].map((key) => `custom.${key}`),
    ...[...attrKeys].map((key) => `${ATTR}${key}`),
  ]);
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  header.forEach((column) => {
    if (seen.has(column)) issues.push({ row: 1, column, message: 'This column appears twice.' });
    else if (!known.has(column))
      issues.push({ row: 1, column, message: 'This column is not recognised. Remove it or rename it.' });
    seen.add(column);
  });
  for (const column of REQUIRED) {
    if (!seen.has(column)) issues.push({ row: 1, column, message: 'This column is missing.' });
  }
  if (issues.length) return empty(issues);
  if (!rows.length) return empty([{ row: 1, column: '', message: 'The file has no rows to import.' }]);

  // Locations the member can see, with the site each sits in.
  const wantedCodes = [
    ...new Set(rows.map((cells) => (cells[header.indexOf('location_code')] ?? '').trim().toUpperCase())),
  ].filter(Boolean);
  const locations = new Map(
    (
      await tx.location.findMany({
        where: { AND: [locationScope(auth), { tenantId, code: { in: wantedCodes } }] },
        select: { id: true, code: true },
      })
    ).map((row) => [row.code, row.id]),
  );
  const siteRows = await tx.locationPath.findMany({
    where: { tenantId, descendantId: { in: [...locations.values()] }, ancestor: { kind: 'site' } },
    select: { descendantId: true, ancestor: { select: { id: true, code: true } } },
  });
  const siteOfLocation = new Map(siteRows.map((row) => [row.descendantId, row.ancestor]));

  const byClass = new Map<string, (typeof classes)[number][]>();
  for (const cls of classes)
    for (const key of [cls.code.toLowerCase(), cls.name.toLowerCase()])
      byClass.set(key, [...(byClass.get(key) ?? []).filter((item) => item.id !== cls.id), cls]);

  const planned: PlannedAsset[] = [];
  const refs = new Map<string, number>();
  rows.forEach((cells, index) => {
    const row = lines[index] ?? index + 2;
    const at = (column: string) => (cells[header.indexOf(column)] ?? '').trim();
    if (cells.length > header.length && cells.slice(header.length).some((cell) => cell.trim() !== '')) {
      issues.push({ row, column: '', message: 'This row has more values than the file has columns.' });
      return;
    }
    const problems: ImportIssue[] = [];
    const cost = at('replacement_cost_minor');
    const costNumber = cost === '' ? null : Number(cost);
    const result = createAssetSchema.safeParse({
      locationId: PLACEHOLDER,
      name: at('name'),
      status: at('status') ? at('status').toLowerCase() : undefined,
      make: at('make') || undefined,
      model: at('model') || undefined,
      serial: at('serial') || undefined,
      installedOn: at('installed_on') || undefined,
      supplier: at('supplier') || undefined,
      expectedLifeYears: at('expected_life_years') === '' ? undefined : Number(at('expected_life_years')),
      replacementCost:
        costNumber === null
          ? undefined
          : { amountMinor: costNumber, currency: (at('currency') || 'GBP').toUpperCase() },
      criticality: at('criticality') ? at('criticality').toLowerCase() : undefined,
      condition: at('condition') ? at('condition').toUpperCase() : undefined,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        const column = SCHEMA_COLUMN[key] ?? '';
        const choices: Record<string, readonly string[]> = {
          status: ASSET_STATUSES,
          criticality: ASSET_CRITICALITIES,
          condition: ASSET_CONDITIONS,
        };
        const message = choices[key] ? `Use one of: ${choices[key]!.join(', ')}.` : issue.message;
        problems.push({ row, column, message });
      }
    }
    if (costNumber !== null && !Number.isInteger(costNumber))
      problems.push({
        row,
        column: 'replacement_cost_minor',
        message: 'Enter whole pence, such as 125000 for £1,250.',
      });
    if (costNumber === null && at('currency'))
      problems.push({ row, column: 'currency', message: 'Enter a replacement cost to go with the currency.' });

    const locationCode = at('location_code').toUpperCase();
    const locationId = locations.get(locationCode);
    const site = locationId ? siteOfLocation.get(locationId) : undefined;
    if (!locationCode) problems.push({ row, column: 'location_code', message: 'Enter a location code.' });
    else if (!locationId)
      problems.push({ row, column: 'location_code', message: `No location has the code ${locationCode}.` });
    else if (!site)
      problems.push({
        row,
        column: 'location_code',
        message: `${locationCode} is not inside a site. Choose a location within a site.`,
      });

    let cls: (typeof classes)[number] | null = null;
    if (at('class')) {
      const matches = byClass.get(at('class').toLowerCase()) ?? [];
      if (matches.length === 1) cls = matches[0]!;
      else
        problems.push({
          row,
          column: 'class',
          message: matches.length
            ? `More than one class is called ${at('class')}. Use its code.`
            : `No class has the name or code ${at('class')}.`,
        });
    }

    const rawAttributes: Record<string, unknown> = {};
    const template = templateOf(cls);
    for (const column of header) {
      if (!column.startsWith(ATTR) || at(column) === '') continue;
      const key = column.slice(ATTR.length);
      const field = template.find((item) => item.key === key);
      if (!field) {
        if (cls) problems.push({ row, column, message: `The class ${cls.name} has no attribute ${key}.` });
        else problems.push({ row, column, message: 'Choose a class before giving attribute values.' });
      } else rawAttributes[key] = coerceCustomCell(field, at(column));
    }
    const attributes = validateCustom(template, rawAttributes);
    if (!attributes.success)
      for (const [key, message] of Object.entries(attributes.errors))
        problems.push({ row, column: `${ATTR}${key}`, message });

    const rawCustom: Record<string, unknown> = {};
    for (const column of header) {
      const key = customKey(column);
      const field = key ? fields.get(key) : undefined;
      if (field && at(column) !== '') rawCustom[field.key] = coerceCustomCell(field, at(column));
    }
    const custom = validateCustom([...fields.values()], rawCustom);
    if (!custom.success)
      for (const [key, message] of Object.entries(custom.errors))
        problems.push({ row, column: `custom.${key}`, message });

    const ref = at('ref');
    if (ref) {
      const first = refs.get(ref.toLowerCase());
      if (first !== undefined)
        problems.push({ row, column: 'ref', message: `The ref ${ref} is already used on line ${first}.` });
      else refs.set(ref.toLowerCase(), row);
    }
    if (problems.length) {
      issues.push(...problems);
      return;
    }
    if (!result.success || !attributes.success || !custom.success || !site || !locationId) return;
    const { data } = result;
    planned.push({
      row,
      ref,
      name: data.name,
      locationId,
      siteId: site.id,
      siteCode: site.code,
      parent: at('parent') || null,
      classId: cls?.id ?? null,
      className: cls?.name ?? null,
      data: {
        status: data.status,
        make: data.make,
        model: data.model,
        serial: data.serial,
        installedOn: data.installedOn,
        supplier: data.supplier,
        expectedLifeYears: data.expectedLifeYears,
        replacementCostMinor: data.replacementCost?.amountMinor ?? null,
        currency: data.replacementCost?.currency ?? 'GBP',
        criticality: data.criticality,
        condition: data.condition,
      },
      attributes: attributes.data as Prisma.InputJsonObject,
      custom: custom.data as Prisma.InputJsonObject,
    });
  });

  // Parents: a ref in this file first, then the number of an asset that already exists.
  const inFile = new Map(planned.filter(({ ref }) => ref).map((item) => [item.ref.toLowerCase(), item]));
  const numbers = [
    ...new Set(
      planned.flatMap(({ parent }) => (parent && !inFile.has(parent.toLowerCase()) ? [parent.toUpperCase()] : [])),
    ),
  ];
  const existing = new Map(
    (
      await tx.asset.findMany({
        where: { AND: [assetScope(auth), { number: { in: numbers } }] },
        select: { id: true, number: true, locationId: true },
      })
    ).map((row) => [row.number, row]),
  );
  const existingSites = new Map(
    (
      await tx.locationPath.findMany({
        where: {
          tenantId,
          descendantId: { in: [...existing.values()].map(({ locationId }) => locationId) },
          ancestor: { kind: 'site' },
        },
        select: { descendantId: true, ancestorId: true },
      })
    ).map((row) => [row.descendantId, row.ancestorId]),
  );

  const valid: PlannedAsset[] = [];
  const existingParents = new Map<string, string>();
  const hasLoop = (item: PlannedAsset): boolean => {
    const trail = new Set<PlannedAsset>([item]);
    let next = item.parent ? inFile.get(item.parent.toLowerCase()) : undefined;
    while (next) {
      if (trail.has(next)) return true;
      trail.add(next);
      next = next.parent ? inFile.get(next.parent.toLowerCase()) : undefined;
    }
    return false;
  };
  for (const item of planned) {
    if (!item.parent) {
      valid.push(item);
      continue;
    }
    const inside = inFile.get(item.parent.toLowerCase());
    if (inside) {
      if (inside === item || hasLoop(item))
        issues.push({ row: item.row, column: 'parent', message: 'The parents in this file form a loop.' });
      else if (inside.siteId !== item.siteId)
        issues.push({
          row: item.row,
          column: 'parent',
          message: 'A component must be in the same site as its parent.',
        });
      else valid.push(item);
      continue;
    }
    const found = existing.get(item.parent.toUpperCase());
    if (!found)
      issues.push({
        row: item.row,
        column: 'parent',
        message: `No ref in this file and no asset has ${item.parent}.`,
      });
    else if (existingSites.get(found.locationId) !== item.siteId)
      issues.push({ row: item.row, column: 'parent', message: 'A component must be in the same site as its parent.' });
    else {
      existingParents.set(found.number, found.id);
      valid.push(item);
    }
  }

  const limit = auth.access!.entitlements.limits.assets;
  if (limit !== null && !issues.length) {
    const adding = valid.filter(({ data }) => data.status !== 'decommissioned').length;
    const used = await tx.asset.count({ where: { tenantId, status: { not: 'decommissioned' } } });
    if (adding && used + adding > limit)
      issues.push({
        row: 1,
        column: 'status',
        message: `Your plan includes ${limit} assets and you have ${used} in use. This file adds ${adding}.`,
      });
  }

  const ordered: PlannedAsset[] = [];
  const placed = new Set<PlannedAsset>();
  let pending = valid;
  while (pending.length) {
    const next = pending.filter(({ parent }) => {
      const inside = parent ? inFile.get(parent.toLowerCase()) : undefined;
      return !inside || placed.has(inside);
    });
    if (!next.length) break;
    for (const item of next) {
      ordered.push(item);
      placed.add(item);
    }
    pending = pending.filter((item) => !placed.has(item));
  }
  issues.sort((a, b) => a.row - b.row);
  return { ordered, issues, existingParents };
}
