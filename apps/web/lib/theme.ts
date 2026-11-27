/** Theme preference: light, dark or follow the system (mockup shell-01). Stored in a cookie so the server renders it. */
export type ThemeChoice = 'light' | 'dark' | 'system';
export const THEME_COOKIE = 'fmstead_theme';

export function parseTheme(value: string | undefined): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function readTheme(): ThemeChoice {
  const match = document.cookie.match(/(?:^|; )fmstead_theme=(light|dark|system)/);
  return parseTheme(match?.[1]);
}

export function applyTheme(choice: ThemeChoice): void {
  document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=31536000; samesite=lax`;
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Runs before first paint when the choice is "system", so the page never flashes the wrong theme. */
export const SYSTEM_THEME_SCRIPT = `try{if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.dataset.theme='dark'}catch(e){}`;
