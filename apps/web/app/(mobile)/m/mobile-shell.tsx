'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@cafm/ui';

const TABS = [
  { href: '/m', label: 'My jobs', icon: 'work-order' },
  { href: '/m/me', label: 'Me', icon: 'user' },
] as const;

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function MobileShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const online = useOnline();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/m' })
        .then(() => navigator.serviceWorker.ready)
        // Keep every screen for offline use, not only the ones visited so far.
        .then(() =>
          Promise.all(['/m', '/m/job', '/m/me'].map((path) => fetch(path, { headers: { accept: 'text/html' } }))),
        )
        .catch(() => undefined);
    }
  }, []);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
      {!online && (
        <div className="m-card" role="status" style={{ margin: 12, background: 'var(--warning-soft)' }}>
          <span className="row" style={{ gap: 8 }}>
            <Icon name="offline" size={18} />
            <span className="sm medium">Offline. Showing the jobs saved on this phone.</span>
          </span>
        </div>
      )}
      <main style={{ flex: 1, paddingBottom: 16 }}>{children}</main>
      <nav
        className="m-tabs"
        aria-label="App sections"
        style={{ position: 'sticky', bottom: 0, gridTemplateColumns: 'repeat(' + TABS.length + ', 1fr)' }}
      >
        {TABS.map((tab) => {
          const on = tab.href === '/m' ? pathname === '/m' || pathname.startsWith('/m/job') : pathname === tab.href;
          return (
            <a
              key={tab.href}
              href={tab.href}
              aria-current={on ? 'page' : undefined}
              style={{
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 500,
                color: on ? 'var(--primary)' : 'var(--text-faint)',
              }}
            >
              <Icon name={tab.icon} size={24} />
              {tab.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
