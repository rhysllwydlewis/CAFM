import { z } from 'zod';
import type { Feature } from './entitlements';
import type { Permission } from './permissions';

/**
 * Saved list views (doc 02 §0). A view stores what someone chose on a list screen: the layout, filters, sort,
 * grouping and columns. It never stores records, so opening a view always shows what the viewer is allowed to see.
 */
export const VIEW_ENTITIES = ['work_orders', 'assets', 'requests', 'ppm_schedules'] as const;
export type ViewEntity = (typeof VIEW_ENTITIES)[number];

/** What a person needs to see a list, and so to save or open a view of it. */
export const VIEW_ENTITY_ACCESS: Record<ViewEntity, { label: string; feature: Feature; permission: Permission }> = {
  work_orders: { label: 'Work orders', feature: 'work_orders', permission: 'work_orders.read' },
  assets: { label: 'Assets', feature: 'assets', permission: 'assets.read' },
  requests: { label: 'Requests', feature: 'helpdesk', permission: 'requests.read' },
  ppm_schedules: { label: 'Planned maintenance', feature: 'ppm', permission: 'ppm.read' },
};

export const VIEW_LAYOUTS = ['list', 'board', 'calendar'] as const;
export type ViewLayout = (typeof VIEW_LAYOUTS)[number];
export const VIEW_VISIBILITIES = ['private', 'shared'] as const;
export type ViewVisibility = (typeof VIEW_VISIBILITIES)[number];

/** Field keys are code identifiers (`status`, `custom.warranty_end`), never free text. */
const fieldKey = z
  .string()
  .max(60)
  .regex(/^[a-z][a-zA-Z0-9_.]*$/, 'Use a field key such as status or custom.zone');
const filterValue = z.union([
  z.string().max(200),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(200)).max(50),
]);

export const viewConfigSchema = z
  .object({
    layout: z.enum(VIEW_LAYOUTS).default('list'),
    filters: z.record(fieldKey, filterValue).default({}),
    sort: z
      .object({ field: fieldKey, dir: z.enum(['asc', 'desc']) })
      .nullable()
      .default(null),
    group: fieldKey.nullable().default(null),
    columns: z.array(fieldKey).max(30).default([]),
  })
  .strict()
  .refine((config) => Object.keys(config.filters).length <= 20, { message: 'A view can have at most 20 filters.' })
  .refine((config) => new Set(config.columns).size === config.columns.length, {
    message: 'Each column can appear once.',
  });
export type ViewConfig = z.infer<typeof viewConfigSchema>;

const viewName = z.string().trim().min(1, 'Give the view a name.').max(80, 'Keep the name to 80 characters.');

export const savedViewSchema = z
  .object({
    entity: z.enum(VIEW_ENTITIES),
    name: viewName,
    visibility: z.enum(VIEW_VISIBILITIES).default('private'),
    config: viewConfigSchema,
  })
  .strict();
export type SavedViewInput = z.infer<typeof savedViewSchema>;

/** The entity can't change once a view exists: it would reinterpret the filters. */
export const updateSavedViewSchema = z
  .object({
    name: viewName,
    visibility: z.enum(VIEW_VISIBILITIES),
    config: viewConfigSchema,
    version: z.number().int().positive(),
  })
  .strict();
export type UpdateSavedViewInput = z.infer<typeof updateSavedViewSchema>;

export interface SavedView {
  id: string;
  entity: ViewEntity;
  name: string;
  visibility: ViewVisibility;
  config: ViewConfig;
  /** True when the signed-in member owns it, and so can change or delete it. */
  mine: boolean;
  ownerName: string | null;
  version: number;
  updatedAt: string;
}
