import { z } from 'zod';

export const ASSET_STATUSES = ['in_service', 'out_of_service', 'alarm', 'spare', 'decommissioned'] as const;
export const ASSET_CRITICALITIES = ['low', 'medium', 'high', 'critical'] as const;
/** Condition grades, A (as new) to D (poor). */
export const ASSET_CONDITIONS = ['A', 'B', 'C', 'D'] as const;
export const ASSET_CLASS_SCHEMES = ['uniclass', 'nrm', 'sfg20', 'custom'] as const;
/** What a class attribute can hold. These are the config engine's field types, so values validate the same way. */
export const ASSET_ATTRIBUTE_TYPES = ['text', 'number', 'date', 'picklist', 'checkbox'] as const;
/** Largest replacement cost: £20m, in pence. */
export const MAX_COST_MINOR = 2_000_000_000;

const id = z.string().uuid().toLowerCase();

/** True for a YYYY-MM-DD string that names a real day (not 2026-02-31). */
export function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-03-14')
  .refine(isCalendarDate, 'Enter a real date');

const optionSchema = z.object({ value: z.string().trim().min(1).max(64), label: z.string().trim().min(1).max(120) });

/** One extra attribute a class gives its assets, such as "Output" in kW for a boiler. */
export const assetAttributeSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,47}$/, 'Use lowercase letters, numbers and underscores, starting with a letter'),
    label: z.string().trim().min(1, 'Enter a label').max(80),
    type: z.enum(ASSET_ATTRIBUTE_TYPES),
    unit: z.string().trim().max(16).optional(),
    required: z.boolean().default(false),
    options: z.array(optionSchema).max(100).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .strict()
  .superRefine((attribute, ctx) => {
    if (attribute.type === 'picklist' && !attribute.options?.length)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least one option' });
    if (attribute.type !== 'picklist' && attribute.options?.length)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Only pick lists have options' });
    if (attribute.options && new Set(attribute.options.map((o) => o.value)).size !== attribute.options.length)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option values must be unique' });
    if (attribute.min !== undefined && attribute.max !== undefined && attribute.min > attribute.max)
      ctx.addIssue({ code: 'custom', path: ['min'], message: 'The minimum is more than the maximum' });
  });
export type AssetAttribute = z.infer<typeof assetAttributeSchema>;

const attributeList = z
  .array(assetAttributeSchema)
  .max(30)
  .refine((list) => new Set(list.map((a) => a.key)).size === list.length, 'Attribute keys must be unique');

export const createAssetClassSchema = z
  .object({
    scheme: z.enum(ASSET_CLASS_SCHEMES),
    code: z.string().trim().min(1, 'Enter a class code').max(40),
    name: z.string().trim().min(1, 'Enter a class name').max(120),
    group: z.string().trim().min(1, 'Choose a heading').max(60),
    attributes: attributeList.default([]),
    position: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();
export const updateAssetClassSchema = createAssetClassSchema
  .omit({ scheme: true, code: true })
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, { message: 'Nothing to change' });

const money = z
  .object({
    amountMinor: z.number().int().min(0).max(MAX_COST_MINOR),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code'),
  })
  .strict();

const fields = {
  locationId: id,
  parentId: id.nullable(),
  classId: id.nullable(),
  name: z.string().trim().min(1, 'Enter an asset name').max(160),
  status: z.enum(ASSET_STATUSES),
  make: z.string().trim().max(120).nullable(),
  model: z.string().trim().max(120).nullable(),
  serial: z.string().trim().max(120).nullable(),
  installedOn: calendarDate.nullable(),
  supplier: z.string().trim().max(160).nullable(),
  expectedLifeYears: z.number().int().min(1).max(200).nullable(),
  replacementCost: money.nullable(),
  criticality: z.enum(ASSET_CRITICALITIES),
  condition: z.enum(ASSET_CONDITIONS).nullable(),
  attributes: z.record(z.unknown()),
  custom: z.record(z.unknown()),
};

export const createAssetSchema = z
  .object({
    locationId: fields.locationId,
    name: fields.name,
    parentId: fields.parentId.default(null),
    classId: fields.classId.default(null),
    status: fields.status.default('in_service'),
    make: fields.make.optional(),
    model: fields.model.optional(),
    serial: fields.serial.optional(),
    installedOn: fields.installedOn.optional(),
    supplier: fields.supplier.optional(),
    expectedLifeYears: fields.expectedLifeYears.optional(),
    replacementCost: fields.replacementCost.optional(),
    criticality: fields.criticality.default('medium'),
    condition: fields.condition.optional(),
    attributes: fields.attributes.default({}),
    custom: fields.custom.default({}),
  })
  .strict();

export const updateAssetSchema = z
  .object({ ...fields, version: z.number().int().positive() })
  .partial()
  .required({ version: true })
  .strict()
  .refine(({ version: _version, ...changes }) => Object.keys(changes).length > 0, { message: 'Nothing to change' });

/** The most assets one bulk action can change, so one request stays quick and its result readable. */
export const BULK_ASSET_LIMIT = 50;

/** Each asset is changed on its own with the version the person saw, so one that has moved on is reported, not overwritten. */
export const bulkAssetSchema = z
  .object({
    action: z.literal('status'),
    items: z
      .array(z.object({ id, version: z.number().int().positive() }).strict())
      .min(1)
      .max(BULK_ASSET_LIMIT)
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length, {
        message: 'Each asset can appear once.',
      }),
    status: z.enum(ASSET_STATUSES),
  })
  .strict();
export type BulkAssetInput = z.infer<typeof bulkAssetSchema>;
export interface BulkAssetResult {
  id: string;
  ok: boolean;
  /** The HTTP status the single-asset call would have given, for a row that failed. */
  status?: number;
  message?: string;
  /** The asset's new version, for a row that worked. */
  version?: number;
}
export interface BulkAssetResponse {
  succeeded: number;
  failed: number;
  results: BulkAssetResult[];
}

export const ASSET_SORTS = ['number', 'name', 'created'] as const;
export type AssetSort = (typeof ASSET_SORTS)[number];

export const listAssetsSchema = z.object({
  after: id.optional(),
  sort: z.enum(ASSET_SORTS).default('created'),
  dir: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(120).optional(),
  /** Assets in this location and everything below it. */
  locationId: id.optional(),
  classId: id.optional(),
  group: z.string().trim().max(60).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  criticality: z.enum(ASSET_CRITICALITIES).optional(),
  condition: z.enum(ASSET_CONDITIONS).optional(),
  /** `root` lists top-level assets; an ID lists that asset's components. */
  parent: z.union([id, z.literal('root')]).optional(),
});

export interface AssetClassRecord {
  id: string;
  scheme: (typeof ASSET_CLASS_SCHEMES)[number];
  code: string;
  name: string;
  group: string;
  attributes: AssetAttribute[];
  position: number;
  active: boolean;
}

export interface AssetRecord {
  id: string;
  number: string;
  name: string;
  status: (typeof ASSET_STATUSES)[number];
  locationId: string;
  /** Where it is, from the portfolio down: "Cardiff HQ › Basement › Plant room B1". */
  locationPath: string[];
  parentId: string | null;
  classId: string | null;
  className: string | null;
  classGroup: string | null;
  make: string | null;
  model: string | null;
  serial: string | null;
  installedOn: string | null;
  supplier: string | null;
  expectedLifeYears: number | null;
  replacementCost: { amountMinor: number; currency: string } | null;
  criticality: (typeof ASSET_CRITICALITIES)[number];
  condition: (typeof ASSET_CONDITIONS)[number] | null;
  attributes: Record<string, unknown>;
  custom: Record<string, unknown>;
  version: number;
}

export interface AssetPage {
  items: (AssetRecord & { componentCount: number })[];
  nextCursor: string | null;
  canManage: boolean;
}

export interface AssetSummary {
  total: number;
  /** Assets in service, out of service or in alarm: the ones that need maintaining. */
  maintainable: number;
  conditionCOrD: number;
  groups: { group: string; count: number }[];
}

/** What an asset serves: the places and the other assets that depend on it. Replaces the whole set. */
export const setServesSchema = z.object({ locationIds: z.array(id).max(200), assetIds: z.array(id).max(200) }).strict();

export interface ServedLocation {
  id: string;
  name: string;
  /** From the site down, like an asset's own location. */
  path: string[];
}

export interface ServedAsset {
  id: string;
  number: string;
  name: string;
  status: (typeof ASSET_STATUSES)[number];
}

export interface AssetServesRecord {
  locations: ServedLocation[];
  assets: ServedAsset[];
  /** Assets that serve this one. */
  servedBy: ServedAsset[];
}

/** Everything that depends on an asset, directly or through other assets it serves. */
export interface AssetImpact {
  assets: (ServedAsset & { depth: number })[];
  locations: ServedLocation[];
}
