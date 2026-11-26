import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { currentUser } from '@/lib/session';
import { ImpersonationBanner } from '../(app)/shell/impersonation-banner';
import { MobileShell } from './m/mobile-shell';

export const metadata: Metadata = {
  title: 'My jobs',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'FM Stead', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#136B7A', width: 'device-width', initialScale: 1 };

/** Signed-in people only. The page itself holds no job data: that is read from the phone's own store. */
export default async function MobileLayout({ children }: { children: ReactNode }) {
  const user = await currentUser('/m');
  return (
    <MobileShell membershipId={user.membershipId}>
      {user.impersonation && <ImpersonationBanner viewing={user.name} {...user.impersonation} />}
      {children}
    </MobileShell>
  );
}
