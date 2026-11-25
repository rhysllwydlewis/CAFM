import { patchJson } from '@/lib/client';

// Saves are sent one at a time, in the order they were made. Two quick clicks would otherwise be two requests that
// could arrive the wrong way round and leave the opposite choice saved.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Saves whether the person collapsed the side menu, on their account, so it follows them to another browser or
 * device. A failed save is not worth interrupting anyone for: the menu is already how they want it for now.
 */
export function saveNavCollapsed(collapsed: boolean): void {
  queue = queue.then(() => patchJson('/auth/preferences', { navCollapsed: collapsed })).catch(() => undefined);
}
