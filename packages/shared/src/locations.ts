import { z } from 'zod';

export const LOCATION_KINDS = ['portfolio', 'region', 'site', 'building', 'floor', 'zone', 'space'] as const;
export const LOCATION_STATUSES = ['open', 'closed', 'mothballed', 'sold'] as const;

const locationId = z.string().uuid().toLowerCase();
const details = z.object({
  parentId: locationId.nullable(),
  name: z.string().trim().min(1, 'Enter a location name').max(120),
  code: z.string().trim().toUpperCase().min(1, 'Enter a location code').max(32),
  status: z.enum(LOCATION_STATUSES),
  custom: z.record(z.unknown()),
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
});

/** A null list removes the explicit restriction. An empty list grants access to no sites. */
export const locationAccessSchema = z.object({ locationIds: z.array(locationId).max(100).nullable() }).strict();
