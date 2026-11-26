import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fmstead/ui/styles.css';
import { parseTheme, SYSTEM_THEME_SCRIPT, THEME_COOKIE } from '@/lib/theme';

export const metadata: Metadata = {
  title: { default: 'FM Stead', template: '%s · FM Stead' },
  icons: { icon: '/favicon.svg' },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en-GB" data-theme={theme === 'system' ? undefined : theme} suppressHydrationWarning>
      <head>{theme === 'system' && <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />}</head>
      <body>{children}</body>
    </html>
  );
}
