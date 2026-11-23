'use client';

import { useState } from 'react';
import { clearStore } from '@/lib/mobile-store';
import { postJson } from '@/lib/client';

export default function MePage() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const response = await postJson('/auth/logout').catch(() => null);
    if (!response?.ok) {
      // Jobs stay on the phone until the person is really signed out.
      setFailed(true);
      setBusy(false);
      return;
    }
    await clearStore().catch(() => undefined);
    window.location.replace('/login');
  }

  return (
    <>
      <div className="m-head">
        <h1 className="m-title" style={{ margin: 0 }}>
          Me
        </h1>
      </div>
      <div className="m-body" style={{ overflow: 'visible' }}>
        <div className="m-card">
          <div className="sm faint">Signing out removes the jobs saved on this phone. You need signal to sign out.</div>
          <button type="button" className="m-btn secondary" onClick={signOut} disabled={busy} aria-busy={busy}>
            Sign out
          </button>
          {failed && (
            <div className="sm" role="alert" style={{ color: 'var(--danger)' }}>
              Could not sign out. Check your signal and try again.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
