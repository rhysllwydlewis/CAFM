/**
 * Permission registry (doc 03). Phase 0 holds only what the foundation uses;
 * each module adds its own keys. The API checks these; the UI only hides things.
 */
export const PERMISSIONS = {
  'people.read': 'See the people in this organisation',
} as const;
export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  super_user: ALL,
  administrator: ALL,
  fm_manager: ['people.read'],
  helpdesk: ['people.read'],
  planner: ['people.read'],
};

export function roleHas(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
