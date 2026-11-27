'use client';

import { useState, type FormEvent } from 'react';
import { Button, Field, Icon, TextInput } from '@fmstead/ui';
import { postJson } from '@/lib/client';

export function ForgotForm() {
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Enter your email or username.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await postJson('/auth/password-reset', { identifier });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (res.ok) setSent(body?.message ?? 'Check your email for a link to reset your password.');
      else
        setError(
          res.status === 429
            ? 'Too many requests. Wait a few minutes and try again.'
            : 'Something went wrong. Try again.',
        );
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="callout" role="status">
        <Icon name="info" />
        <div className="grow">{sent}</div>
      </div>
    );
  }
  return (
    <form className="stack g3" onSubmit={onSubmit} noValidate>
      <p className="muted" style={{ margin: 0 }}>
        Enter your email or username and we&apos;ll email you a link to choose a new password.
      </p>
      {error && (
        <div className="callout danger" role="alert" id="forgot-error">
          <Icon name="warning" />
          <div className="grow">{error}</div>
        </div>
      )}
      <Field label="Email or username" htmlFor="identifier">
        <TextInput
          lg
          id="identifier"
          autoComplete="username"
          value={identifier}
          invalid={!!error}
          aria-describedby={error ? 'forgot-error' : undefined}
          onChange={(e) => setIdentifier(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" size="lg" block disabled={busy}>
        {busy ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
