'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clearStore, readOutbox } from '@/lib/mobile-store';
import { postJson } from '@/lib/client';

export default function MePage() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unsynced, setUnsynced] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    void readOutbox().then((records) => setUnsynced(records.length));
  }, []);

  async function signOut() {
    if (busy) return;
    // Signing out deletes what is saved on the phone, so changes not sent yet need a second, deliberate tap.
    if (unsynced > 0 && !confirmed) {
      setConfirmed(true);
      return;
    }
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
          <div className="sm faint">Change your password, or set up two-step verification. You need signal.</div>
          <Link className="m-btn secondary" href="/app/account/security">
            Account security
          </Link>
        </div>
        <div className="m-card">
          <div className="sm faint">Signing out removes the jobs saved on this phone. You need signal to sign out.</div>
          <button type="button" className="m-btn secondary" onClick={signOut} disabled={busy} aria-busy={busy}>
            {confirmed ? 'Sign out and lose them' : 'Sign out'}
          </button>
          {unsynced > 0 && (
            <div className="sm" role="alert" style={{ color: 'var(--warning-text)' }}>
              {unsynced} {unsynced === 1 ? 'change has' : 'changes have'} not synced. Signing out deletes{' '}
              {unsynced === 1 ? 'it' : 'them'}. Sync first from the Sync tab.
            </div>
          )}
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
