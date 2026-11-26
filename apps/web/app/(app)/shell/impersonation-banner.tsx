'use client';

import { useState } from 'react';
import { Button, Icon } from '@fmstead/ui';
import { adminWrite } from '@/lib/admin-client';
import { t } from '@/lib/i18n';

/** Shown on every page while a Super User is viewing as someone else (P1-09c). Always visible, never dismissible. */
export function ImpersonationBanner({ viewing, by, expiresAt }: { viewing: string; by: string; expiresAt: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const until = new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Europe/London' }).format(
    new Date(expiresAt),
  );

  async function end() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await adminWrite<{ landingPage: string }>('/admin/impersonation/end', {});
      window.location.assign(res?.landingPage ?? '/app');
    } catch (e) {
      // If your own access has gone, ending signs you out.
      if (e instanceof Error && /sign in|unauthori[sz]ed/i.test(e.message)) window.location.assign('/login');
      setError(e instanceof Error ? e.message : t('impersonation.endFailed'));
      setBusy(false);
    }
  }

  return (
    <div className="callout warning shell-banner" role="status">
      <Icon name="view" />
      <div className="grow">
        {t('impersonation.banner', { viewing, by, until })}
        {error && (
          <span role="alert" className="field-error">
            {' '}
            {error}
          </span>
        )}
      </div>
      <Button variant="secondary" disabled={busy} onClick={end}>
        {t('impersonation.end')}
      </Button>
    </div>
  );
}
