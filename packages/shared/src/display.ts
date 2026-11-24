import { z } from 'zod';
import type { Feature } from './entitlements';

/**
 * Modules and terminology (doc 03 § Admin). An organisation can switch menu modules off, use its own name
 * for one, and put them in its own order within a menu section. It can also use its own word for a few
 * standard terms. Home, My requests and Administration can't be switched off, so nobody is locked out.
 */

export interface ModuleDef {
  key: string;
  label: string;
  /** The plan feature that unlocks the module, if any (shown in the plan column). */
  feature?: Feature;
}

/** The modules in the main menu that an organisation may switch off, in the standard order. */
export const MODULES: ModuleDef[] = [
  { key: 'helpdesk', label: 'Helpdesk', feature: 'helpdesk' },
  { key: 'work-orders', label: 'Work orders', feature: 'work_orders' },
  { key: 'ppm', label: 'Planned maintenance', feature: 'ppm' },
  { key: 'scheduling', label: 'Scheduling', feature: 'scheduling' },
  { key: 'assets', label: 'Assets', feature: 'assets' },
  { key: 'locations', label: 'Locations', feature: 'locations' },
  { key: 'space', label: 'Space and floor plans', feature: 'space' },
  { key: 'documents', label: 'Documents', feature: 'documents' },
  { key: 'compliance', label: 'Compliance', feature: 'compliance' },
  { key: 'inspections', label: 'Inspections and audits', feature: 'compliance' },
  { key: 'safety', label: 'Health and safety', feature: 'health_safety' },
  { key: 'contractors', label: 'Contractors', feature: 'contractors' },
  { key: 'contracts', label: 'Contracts and SLAs', feature: 'contracts' },
  { key: 'inventory', label: 'Inventory', feature: 'inventory' },
  { key: 'purchasing', label: 'Purchasing', feature: 'purchasing' },
  { key: 'finance', label: 'Finance', feature: 'finance' },
  { key: 'bookings', label: 'Bookings', feature: 'workplace' },
  { key: 'visitors', label: 'Visitors', feature: 'workplace' },
  { key: 'energy', label: 'Energy and carbon', feature: 'energy' },
  { key: 'reports', label: 'Reports', feature: 'reports' },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

export interface TermDef {
  key: string;
  singular: string;
  plural: string;
}

/** The standard words an organisation may replace, for example "Site" with "School". */
export const TERMS: TermDef[] = [
  { key: 'work_order', singular: 'Work order', plural: 'Work orders' },
  { key: 'request', singular: 'Request', plural: 'Requests' },
  { key: 'site', singular: 'Site', plural: 'Sites' },
  { key: 'asset', singular: 'Asset', plural: 'Assets' },
  { key: 'contractor', singular: 'Contractor', plural: 'Contractors' },
];

export const TERM_KEYS = TERMS.map((t) => t.key);

/** One module as the admin screen shows it. */
export interface ModuleSettingView {
  key: string;
  standardLabel: string;
  /** The plan feature, and whether this organisation's plan includes it. */
  feature: Feature | null;
  inPlan: boolean;
  enabled: boolean;
  label: string | null;
  position: number | null;
}

export interface TermView extends TermDef {
  /** The organisation's own words, or null for the standard ones. */
  custom: { singular: string; plural: string } | null;
}

/** What the menu needs, for every signed-in person: only the choices, never plan or permission details. */
export interface DisplaySettings {
  modules: Array<{ key: string; enabled: boolean; label: string | null; position: number | null }>;
  terms: Array<{ key: string; singular: string; plural: string }>;
}

const name = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(40, 'Use 40 characters or fewer.')
  // No markup or control characters in a menu label.
  .refine((v) => !/[<>\u0000-\u001f]/.test(v), 'Use letters, numbers and ordinary punctuation only.');

export const updateModulesSchema = z.object({
  modules: z
    .array(
      z.object({
        key: z.string().refine((k) => MODULE_KEYS.includes(k), 'Unknown module.'),
        enabled: z.boolean(),
        label: name.nullable(),
        position: z.number().int().min(1).max(99).nullable(),
      }),
    )
    .max(MODULES.length)
    .refine((list) => new Set(list.map((m) => m.key)).size === list.length, 'Each module can appear once.'),
});
export type UpdateModulesInput = z.infer<typeof updateModulesSchema>;

export const updateTermsSchema = z.object({
  terms: z
    .array(
      z.object({
        key: z.string().refine((k) => TERM_KEYS.includes(k), 'Unknown term.'),
        /** null puts the standard words back. */
        custom: z.object({ singular: name, plural: name }).nullable(),
      }),
    )
    .max(TERMS.length)
    .refine((list) => new Set(list.map((t) => t.key)).size === list.length, 'Each term can appear once.'),
});
export type UpdateTermsInput = z.infer<typeof updateTermsSchema>;

/** The word to show for a term: the organisation's own if it has one. */
export function termLabel(display: DisplaySettings | undefined, key: string, plural = false): string {
  const standard = TERMS.find((t) => t.key === key);
  const custom = display?.terms.find((t) => t.key === key);
  const source = custom ?? standard;
  return (plural ? source?.plural : source?.singular) ?? key;
}
