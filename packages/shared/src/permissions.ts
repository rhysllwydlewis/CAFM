/**
 * Permission registry (doc 03). Phase 0 holds only what the foundation uses;
 * each module adds its own keys. The API checks these; the UI only hides things.
 */
/** Built-in roles and their display names (doc 03 § Built-in roles). */
export const ROLES = {
  super_user: 'Super User',
  administrator: 'Administrator',
  fm_manager: 'FM Manager',
  helpdesk: 'Helpdesk Operator',
  planner: 'Supervisor / Planner',
  technician: 'Technician',
  contractor: 'Contractor',
  requester: 'Requester / Occupant',
  compliance: 'Compliance / H&S Officer',
  finance: 'Finance',
  stores: 'Stores Clerk',
  space_planner: 'Space Planner',
  client_viewer: 'Client Viewer',
  auditor: 'Auditor',
  executive: 'Executive',
} as const;
export type Role = keyof typeof ROLES;

export function roleLabel(role: string): string {
  return (ROLES as Record<string, string>)[role] ?? role;
}

export const PERMISSIONS = {
  'people.read': 'See the people in this organisation',
} as const;
export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Partial<Record<Role, readonly Permission[]>> = {
  super_user: ALL,
  administrator: ALL,
  fm_manager: ['people.read'],
  helpdesk: ['people.read'],
  planner: ['people.read'],
};

export function roleHas(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role as Role]?.includes(permission) ?? false;
}
