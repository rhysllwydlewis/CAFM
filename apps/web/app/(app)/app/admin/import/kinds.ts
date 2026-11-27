import { can, feature, type Permission } from '@fmstead/shared';

export interface ImportKind {
  key: 'locations' | 'assets' | 'people' | 'ppm';
  label: string;
  /** What one row becomes, for the button and messages. */
  noun: string;
  /** The API path the import endpoints sit under. */
  base: string;
  /** Permission to import. */
  manage: Permission;
  /** Permission to export, and the export path. */
  read: Permission;
  exportPath: string;
  /** Plan feature that must be on, if any. */
  feature?: 'locations' | 'assets' | 'ppm';
}

export const IMPORT_KINDS: ImportKind[] = [
  {
    key: 'locations',
    label: 'Locations',
    noun: 'locations',
    base: '/locations',
    manage: 'locations.manage',
    read: 'locations.read',
    exportPath: '/locations/export',
    feature: 'locations',
  },
  {
    key: 'assets',
    label: 'Assets',
    noun: 'assets',
    base: '/assets',
    manage: 'assets.manage',
    read: 'assets.read',
    exportPath: '/assets/export',
    feature: 'assets',
  },
  {
    key: 'people',
    label: 'People',
    noun: 'invitations',
    base: '/people',
    manage: 'people.invite',
    read: 'people.read',
    exportPath: '/people/export',
  },
  {
    key: 'ppm',
    label: 'PPM schedules',
    noun: 'schedules',
    base: '/ppm/schedules',
    manage: 'ppm.manage',
    read: 'ppm.read',
    exportPath: '/ppm/schedules/export',
    feature: 'ppm',
  },
];

type Who = { permissions: readonly string[]; entitlements: { features: readonly string[] } | null };

const inPlan = (user: Who, kind: ImportKind) => !kind.feature || feature(user.entitlements, kind.feature);

export const importable = (user: Who) => IMPORT_KINDS.filter((k) => can(user, k.manage) && inPlan(user, k));
export const exportable = (user: Who) => IMPORT_KINDS.filter((k) => can(user, k.read) && inPlan(user, k));
