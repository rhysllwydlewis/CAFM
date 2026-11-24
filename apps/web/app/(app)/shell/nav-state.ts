/** The cookie that remembers whether the person collapsed the side menu on a desktop. */
export const NAV_COOKIE = 'cafm_nav';

/** Remember the choice for a year. It holds no personal data, and the server reads it so the page paints right. */
export function saveNavCollapsed(collapsed: boolean): void {
  document.cookie = `${NAV_COOKIE}=${collapsed ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`;
}
