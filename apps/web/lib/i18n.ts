/**
 * Interface text (en-GB). Every user-facing string in the shell comes from
 * here, so adding Welsh (doc 10, D9) means adding a dictionary, not hunting
 * through components. Placeholders: {name}.
 */
const enGB = {
  'shell.search': 'Search or jump to…',
  'shell.searchShortcut': 'Ctrl K',
  'shell.notifications': 'Notifications',
  'shell.notificationsEmpty': 'You’re all caught up. Notifications about your work will appear here.',
  'shell.help': 'Help',
  'shell.menu': 'Menu',
  'shell.closeMenu': 'Close menu',
  'shell.userMenu': 'Account and settings:',
  'shell.organisation': 'Organisation',
  'shell.theme': 'Theme',
  'shell.themeLight': 'Light',
  'shell.themeDark': 'Dark',
  'shell.themeSystem': 'System',
  'shell.locked': 'Not in your plan',
  'palette.title': 'Go to',
  'palette.placeholder': 'Type a page name…',
  'palette.empty': 'No pages match.',
  'demo.resetSoon': 'The demo resets at 03:00 (UK time), in {minutes} minutes. Anything you change will be cleared.',
} as const;

export type MessageKey = keyof typeof enGB;

export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  return enGB[key].replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}
