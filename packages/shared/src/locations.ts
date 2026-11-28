import { z } from 'zod';
import { siteCalendarSchema, type SiteCalendar } from './site-calendar';

export const LOCATION_KINDS = ['portfolio', 'region', 'site', 'building', 'floor', 'zone', 'space'] as const;
export const LOCATION_STATUSES = ['open', 'closed', 'mothballed', 'sold'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

/** Only organisation-wide managers create these, because they shape the whole estate. */
export const TOP_LEVEL_KINDS: readonly LocationKind[] = ['portfolio', 'region', 'site'];

/**
 * Levels run from the top down and can be skipped but never inverted, so a building can sit
 * straight under a site but not inside a room. Zones and spaces can nest (a cupboard in a plant room).
 */
export function canContain(parent: LocationKind, child: LocationKind): boolean {
  const [above, below] = [LOCATION_KINDS.indexOf(parent), LOCATION_KINDS.indexOf(child)];
  return below > above || (below === above && (child === 'zone' || child === 'space'));
}

const locationId = z.string().uuid().toLowerCase();
export const locationDetailsSchema = z
  .object({
    address: z.string().trim().max(300).optional(),
    latitude: z.number().finite().min(-90).max(90).optional(),
    longitude: z.number().finite().min(-180).max(180).optional(),
    grossArea: z.number().finite().min(0).optional(),
    netArea: z.number().finite().min(0).optional(),
    useClass: z.string().trim().max(100).optional(),
    listed: z.boolean().optional(),
    contact: z.string().trim().max(200).optional(),
    parking: z.string().trim().max(500).optional(),
    hazards: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((detail, ctx) => {
    if ((detail.latitude === undefined) !== (detail.longitude === undefined))
      ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Enter both latitude and longitude.' });
    if (detail.netArea !== undefined && detail.grossArea !== undefined && detail.netArea > detail.grossArea)
      ctx.addIssue({ code: 'custom', path: ['netArea'], message: 'Net area cannot exceed gross area.' });
  });
export type LocationDetails = z.infer<typeof locationDetailsSchema>;

const details = z.object({
  parentId: locationId.nullable(),
  name: z.string().trim().min(1, 'Enter a location name').max(120),
  code: z.string().trim().toUpperCase().min(1, 'Enter a location code').max(32),
  status: z.enum(LOCATION_STATUSES),
  custom: z.record(z.string(), z.unknown()),
  details: locationDetailsSchema.optional(),
  siteCalendar: siteCalendarSchema.optional(),
  restrictedAccess: z.string().trim().max(600).nullable().optional(),
});

export const createLocationSchema = details
  .extend({
    kind: z.enum(LOCATION_KINDS),
    parentId: details.shape.parentId.default(null),
    status: details.shape.status.default('open'),
    custom: details.shape.custom.default({}),
  })
  .strict();

export const updateLocationSchema = details
  .partial()
  .extend({ version: z.number().int().positive() })
  .strict()
  .refine(({ version: _version, ...changes }) => Object.keys(changes).length > 0, { message: 'Nothing to change' });

export const listLocationsSchema = z.object({
  after: locationId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(120).optional(),
  kind: z.enum(LOCATION_KINDS).optional(),
  status: z.enum(LOCATION_STATUSES).optional(),
  parent: z.union([locationId, z.literal('root')]).optional(),
});

/** A null list removes the explicit restriction. An empty list grants access to no sites. */
export const locationAccessSchema = z.object({ locationIds: z.array(locationId).max(100).nullable() }).strict();

export interface LocationRecord {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  kind: (typeof LOCATION_KINDS)[number];
  status: (typeof LOCATION_STATUSES)[number];
  version: number;
  details: LocationDetails;
  custom: Record<string, unknown>;
  siteCalendar: SiteCalendar | null;
  restrictedAccess?: string | null;
}

/** An ancestor shown in a location's path, from the top down. */
export interface LocationCrumb {
  id: string;
  name: string;
  code: string;
  kind: LocationKind;
}

/** One location with the ancestors the member can see. Ancestors outside their branches are left out. */
export interface LocationDetail extends LocationRecord {
  path: LocationCrumb[];
}

export interface LocationPage {
  items: (LocationRecord & { hasChildren: boolean })[];
  nextCursor: string | null;
  canManageHierarchy: boolean;
}
