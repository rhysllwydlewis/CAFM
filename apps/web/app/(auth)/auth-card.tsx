import type { ReactNode } from 'react';
import { Wordmark } from '@cafm/ui';

/** The centred card used by the sign-in side pages (pattern from auth-04 and auth-05). */
export function AuthCard({ title, width = 440, children }: { title: string; width?: number; children: ReactNode }) {
  return (
    <div className="center-screen">
      <div className="card" style={{ width, maxWidth: '100%', boxShadow: 'var(--shadow-md)' }}>
        <div className="card-b stack" style={{ padding: 28 }}>
          <Wordmark height={26} />
          <h1 className="dialog-title">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
