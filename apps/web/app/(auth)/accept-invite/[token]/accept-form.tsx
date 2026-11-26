'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LoginResponse } from '@fmstead/shared';
import { Button, Checkbox, Field, Icon, TextInput } from '@fmstead/ui';
import { postJson } from '@/lib/client';
import { NewPasswordFields } from '../../new-password-fields';

export function AcceptForm({ token, newAccount, email }: { token: string; newAccount: boolean; email: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [matches, setMatches] = useState(true);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newAccount && !name.trim()) return setError('Enter your name.');
    if (newAccount && !matches) return setError('The two passwords don’t match.');
    if (!terms) return setError('Accept the terms of service to continue.');
    setBusy(true);
    setError(null);
    const res = await postJson(`/auth/invites/${encodeURIComponent(token)}/accept`, {
      ...(newAccount ? { name, password } : {}),
      acceptTerms: true,
    });
    if (res.ok) {
      const body = (await res.json()) as LoginResponse;
      router.push(body.status === 'signed_in' ? body.landingPage : '/select-organisation');
      router.refresh();
      return;
    }
    setBusy(false);
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    setError(body?.message ?? 'Something went wrong. Try again.');
  }

  return (
    <form className="stack g3" onSubmit={onSubmit} noValidate>
      {error && (
        <div className="callout danger" role="alert">
          <Icon name="warning" />
          <div className="grow">{error}</div>
        </div>
      )}
      {newAccount && (
        <>
          <Field label="Your name" htmlFor="name">
            <TextInput lg id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
          <NewPasswordFields
            onChange={(p, m) => {
              setPassword(p);
              setMatches(m);
            }}
          />
        </>
      )}
      <div className="row sm" style={{ gap: 6 }}>
        <Checkbox label="I accept the" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <Link href="/terms" target="_blank" className="medium">
          terms of service
        </Link>
      </div>
      <Button type="submit" variant="primary" size="lg" block disabled={busy}>
        {busy ? 'Joining…' : 'Accept and join'}
      </Button>
    </form>
  );
}
