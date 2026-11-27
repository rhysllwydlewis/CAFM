'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, Icon } from '@fmstead/ui';
import { postJson } from '@/lib/client';
import { NewPasswordFields } from '../../new-password-fields';

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [matches, setMatches] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!matches) return setError('The two passwords don’t match.');
    setBusy(true);
    setError(null);
    const res = await postJson('/auth/password-reset/confirm', { token, password });
    setBusy(false);
    if (res.ok) return setDone(true);
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    setError(body?.message ?? 'Something went wrong. Try again.');
  }

  if (done) {
    return (
      <>
        <div className="callout" role="status">
          <Icon name="info" />
          <div className="grow">Your password has been changed, and you&apos;ve been signed out everywhere else.</div>
        </div>
        <Link href="/login" className="medium">
          Sign in
        </Link>
      </>
    );
  }
  return (
    <form className="stack g3" onSubmit={onSubmit} noValidate>
      {error && (
        <div className="callout danger" role="alert">
          <Icon name="warning" />
          <div className="grow">{error}</div>
        </div>
      )}
      <NewPasswordFields
        invalid={!!error}
        onChange={(p, m) => {
          setPassword(p);
          setMatches(m);
        }}
      />
      <Button type="submit" variant="primary" size="lg" block disabled={busy}>
        {busy ? 'Saving…' : 'Save new password'}
      </Button>
    </form>
  );
}
