import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@cafm/ui/styles.css';

export const metadata: Metadata = {
  title: { default: 'CAFM', template: '%s · CAFM' },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
