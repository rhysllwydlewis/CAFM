'use client';

import { useState } from 'react';
import { Button } from '@cafm/ui';
import { postJson } from '@/lib/client';

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const response = await postJson('/auth/logout').catch(() => null);
    if (response?.ok) {
      window.location.replace('/login');
      return;
    }
    setFailed(true);
    setBusy(false);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon="log-out"
        className="nav-signout"
        aria-disabled={busy}
        aria-busy={busy}
        onClick={signOut}
      >
        Sign out
      </Button>
      {failed && (
        <div className="xs nav-signout-error" role="alert">
          Could not sign out. Try again.
        </div>
      )}
    </>
  );
}
