'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Icon, TextInput } from '@cafm/ui';
import type { LoginResponse } from '@cafm/shared';
import { postJson } from '@/lib/client';

export function MfaForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [recovery, setRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const entered = value.trim();
    if (!entered) {
      setError(recovery ? 'Enter a recovery code.' : 'Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await postJson('/auth/mfa/verify', recovery ? { recoveryCode: entered } : { code: entered });
      if (res.ok) {
        const body = (await res.json()) as LoginResponse;
        router.push(
          body.status === 'signed_in'
            ? (next ?? body.landingPage)
            : '/select-organisation' + (next ? '?next=' + encodeURIComponent(next) : ''),
        );
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
      const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
      setError(
        (res.status === 401 || res.status === 429 || res.status === 400) && message
          ? message
          : 'Something went wrong. Try again in a moment.',
      );
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  }

  return (
    <form className="stack g3" onSubmit={onSubmit} noValidate>
      <p className="muted" style={{ margin: 0 }}>
        {recovery
          ? 'Enter one of the recovery codes you saved. Each one works once.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </p>
      {error && (
        <div className="callout danger" role="alert" id="mfa-error">
          <Icon name="warning" />
          <div className="grow">{error}</div>
        </div>
      )}
      <Field label={recovery ? 'Recovery code' : '6-digit code'} htmlFor="mfa-code">
        <TextInput
          lg
          id="mfa-code"
          key={recovery ? 'recovery' : 'code'}
          autoFocus
          inputMode={recovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          invalid={!!error}
          aria-describedby={error ? 'mfa-error' : undefined}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" size="lg" block disabled={busy}>
        {busy ? 'Checking…' : 'Verify'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        block
        onClick={() => {
          setRecovery(!recovery);
          setValue('');
          setError(null);
        }}
      >
        {recovery ? 'Use the app instead' : 'Use a recovery code'}
      </Button>
    </form>
  );
}
