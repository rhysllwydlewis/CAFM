import type { ShellNavItem } from './types';

/**
 * The one menu item that matches an address. When more than one does, the longest address wins, so
 * /app/admin/import is "Import and export" and not "Administration" as well (issue #104).
 */
export function activeNavItem(items: ShellNavItem[], pathname: string): ShellNavItem | undefined {
  let best: ShellNavItem | undefined;
  for (const item of items) {
    const matches = item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href);
    if (matches && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}
