/**
 * Permission registry and built-in roles (doc 03). The API checks these; the
 * UI only hides things. Each module adds its own keys here as it is built.
 */

export const PERMISSIONS = {
  // People and access
  'people.read': { module: 'people', label: 'See the people in this organisation' },
  'people.invite': { module: 'people', label: 'Invite people', admin: true },
  'people.manage': { module: 'people', label: "Change people's roles and deactivate them", admin: true },
  'people.impersonate': {
    module: 'people',
    label: 'View the app as another person (read-only, audited)',
    admin: true,
  },
  'roles.read': { module: 'roles', label: 'See roles and their permissions' },
  'roles.manage': { module: 'roles', label: 'Create and edit roles', admin: true },
  'audit.read': { module: 'audit', label: 'See the audit log', admin: true },
  'settings.manage': { module: 'settings', label: 'Change organisation settings', admin: true },
  'billing.manage': { module: 'billing', label: 'Manage the subscription and billing', admin: true },
  // Phase 1 modules (registered now so roles can be set up ahead of them)
  'locations.read': { module: 'locations', label: 'See sites, buildings and rooms' },
  'locations.manage': { module: 'locations', label: 'Create and edit sites, buildings and rooms' },
  'assets.read': { module: 'assets', label: 'See assets' },
  'assets.manage': { module: 'assets', label: 'Create and edit assets' },
  'assets.record_readings': { module: 'assets', label: 'Record meter readings' },
  'requests.create': { module: 'helpdesk', label: 'Raise requests' },
  'requests.read': { module: 'helpdesk', label: 'See all requests' },
  'requests.manage': { module: 'helpdesk', label: 'Triage and convert requests' },
  'work_orders.read': { module: 'work_orders', label: 'See work orders' },
  'work_orders.edit': { module: 'work_orders', label: 'Create and edit work orders' },
  'work_orders.assign': { module: 'work_orders', label: 'Assign and dispatch work orders' },
  'work_orders.close': { module: 'work_orders', label: 'Complete and close work orders' },
  'ppm.read': { module: 'ppm', label: 'See planned maintenance' },
  'ppm.manage': { module: 'ppm', label: 'Plan and schedule maintenance' },
  'costs.read': { module: 'finance', label: 'See costs and rates' },
  'costs.manage_rates': { module: 'finance', label: 'Set labour rates', admin: true },
  'time.record': { module: 'work_orders', label: 'Record time on work orders' },
  'reports.read': { module: 'reports', label: 'See reports and dashboards' },
  'views.share': { module: 'views', label: 'Share saved list views with everyone' },
} as const satisfies Record<string, { module: string; label: string; admin?: boolean }>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

export function isAdminPermission(permission: Permission): boolean {
  return 'admin' in PERMISSIONS[permission] && PERMISSIONS[permission].admin === true;
}

/**
 * Data scope (doc 03): which records a role's permissions apply to.
 * `sites` and `team` arrive with locations and teams in Phase 1.
 */
export const SCOPES = ['all', 'own'] as const;
export type Scope = (typeof SCOPES)[number];

export interface BuiltinRole {
  key: string;
  name: string;
  description: string;
  permissions: readonly Permission[];
  scope: Scope;
}

const OPERATIONS: Permission[] = [
  'locations.read',
  'assets.read',
  'requests.create',
  'requests.read',
  'work_orders.read',
  'ppm.read',
  'reports.read',
];

/** Seeded into every tenant (doc 03 § Default roles). All but Super User can be edited. */
export const BUILTIN_ROLES: BuiltinRole[] = [
  {
    key: 'super_user',
    name: 'Super User',
    description: 'All permissions, including security, billing and roles',
    permissions: ALL_PERMISSIONS,
    scope: 'all',
  },
  {
    key: 'administrator',
    name: 'Administrator',
    description: 'All configuration and user management, excluding billing',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'billing.manage' && p !== 'people.impersonate'),
    scope: 'all',
  },
  {
    key: 'fm_manager',
    name: 'FM Manager',
    description: 'All operational modules, approvals and reports',
    permissions: [
      'people.read',
      'roles.read',
      'locations.manage',
      'assets.manage',
      'assets.record_readings',
      'requests.manage',
      'work_orders.edit',
      'work_orders.assign',
      'work_orders.close',
      'time.record',
      'ppm.manage',
      'costs.read',
      'views.share',
      ...OPERATIONS,
    ],
    scope: 'all',
  },
  {
    key: 'helpdesk',
    name: 'Helpdesk Operator',
    description: 'Logs, triages and assigns requests and work orders',
    permissions: ['people.read', 'requests.manage', 'work_orders.edit', 'work_orders.assign', ...OPERATIONS],
    scope: 'all',
  },
  {
    key: 'planner',
    name: 'Supervisor / Planner',
    description: 'Schedules and dispatches work, plans maintenance',
    permissions: ['people.read', 'work_orders.edit', 'work_orders.assign', 'time.record', 'ppm.manage', ...OPERATIONS],
    scope: 'all',
  },
  {
    key: 'technician',
    name: 'Technician',
    description: 'Own assigned jobs on mobile',
    permissions: [
      'requests.create',
      'work_orders.read',
      'work_orders.close',
      'time.record',
      'assets.read',
      'locations.read',
      'assets.record_readings',
    ],
    scope: 'own',
  },
  {
    key: 'contractor',
    name: 'Contractor',
    description: "Jobs assigned to the contractor's company",
    permissions: ['work_orders.read', 'work_orders.close'],
    scope: 'own',
  },
  {
    key: 'requester',
    name: 'Requester / Occupant',
    description: 'Raises and tracks their own requests',
    permissions: ['requests.create'],
    scope: 'own',
  },
  {
    key: 'compliance',
    name: 'Compliance / H&S Officer',
    description: 'Compliance, audits, incidents, permits and risk',
    permissions: ['people.read', ...OPERATIONS],
    scope: 'all',
  },
  {
    key: 'finance',
    name: 'Finance',
    description: 'Budgets, purchase orders, invoices and cost views',
    permissions: ['people.read', 'costs.read', 'costs.manage_rates', 'reports.read', 'work_orders.read'],
    scope: 'all',
  },
  {
    key: 'stores',
    name: 'Stores Clerk',
    description: 'Inventory and goods received',
    permissions: ['assets.read', 'locations.read', 'work_orders.read'],
    scope: 'all',
  },
  {
    key: 'space_planner',
    name: 'Space Planner',
    description: 'Space, floor plans and moves',
    permissions: ['locations.manage', 'locations.read', 'reports.read'],
    scope: 'all',
  },
  {
    key: 'client_viewer',
    name: 'Client Viewer',
    description: "Read-only view of their contract's work",
    permissions: ['work_orders.read', 'reports.read'],
    scope: 'own',
  },
  {
    key: 'auditor',
    name: 'Auditor',
    description: 'Read-only compliance evidence',
    permissions: ['locations.read', 'assets.read', 'ppm.read', 'reports.read'],
    scope: 'all',
  },
  {
    key: 'executive',
    name: 'Executive',
    description: 'Dashboards and reports',
    permissions: ['reports.read', 'costs.read'],
    scope: 'all',
  },
];

export const BUILTIN_ROLE_KEYS = BUILTIN_ROLES.map((r) => r.key);

/** Display name for a built-in role key; custom roles carry their own name. */
export function roleLabel(role: string): string {
  return BUILTIN_ROLES.find((r) => r.key === role)?.name ?? role;
}

/** Permissions the actor holds that the target set does not exceed. Empty when nothing escalates. */
export function escalations(actor: Iterable<string>, requested: Iterable<string>): string[] {
  const held = new Set(actor);
  return [...new Set(requested)].filter((p) => !held.has(p));
}

/** Front-end helper: hides UI the user can't use. The API is still the authority. */
export function can(user: { permissions: readonly string[] } | null | undefined, permission: Permission): boolean {
  return !!user && user.permissions.includes(permission);
}

/** Licence type a role implies (doc 07 § Licence types). */
export function licenceForRole(role: string): string {
  switch (role) {
    case 'technician':
      return 'mobile';
    case 'contractor':
      return 'contractor';
    case 'requester':
      return 'requester';
    case 'client_viewer':
      return 'client';
    case 'auditor':
    case 'executive':
      return 'read_only';
    default:
      return 'full';
  }
}
