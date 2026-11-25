import { patchJson } from '@/lib/client';

/**
 * Saves whether the person collapsed the side menu, on their account, so it follows them to another browser or
 * device. A failed save is not worth interrupting anyone for: the menu is already how they want it for now.
 */
export function saveNavCollapsed(collapsed: boolean): void {
  void patchJson('/auth/preferences', { navCollapsed: collapsed }).catch(() => undefined);
}
