'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Field, Icon, TextInput } from '@cafm/ui';
import type { LoginResponse } from '@cafm/shared';
import { postJson } from '@/lib/client';

export interface DemoPersonaCard {
  key: string;
  name: string;
  email: string;
  roleLabel: string;
  description: string;
  featured: boolean;
}
export interface DemoAccounts {
  password: string;
  personas: DemoPersonaCard[];
}

const ICONS: Record<string, string> = {
  superuser: 'admin',
  admin: 'settings',
  manager: 'dashboard',
  helpdesk: 'helpdesk',
  technician: 'tool',
  contractor: 'contractor',
  requester: 'requester',
  finance: 'finance',
  compliance: 'compliance',
  space: 'space',
};

export function LoginForm({ demo }: { demo: DemoAccounts | null }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState('');
  const submitRef = useRef<HTMLButtonElement>(null);

  function fill(p: DemoPersonaCard) {
    setIdentifier(p.email);
    setPassword(demo!.password);
    setSelected(p.key);
    setError(null);
    setAnnounce(`Filled in the details for ${p.name}, ${p.roleLabel}. Press Sign in to continue.`);
    submitRef.current?.focus();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Enter your email or username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await postJson('/auth/login', { identifier, password, keepSignedIn });
      if (res.ok) {
        const body = (await res.json()) as LoginResponse;
        router.push(body.status === 'signed_in' ? body.landingPage : '/select-organisation');
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
      const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
      setError(
        (res.status === 401 || res.status === 429) && message
          ? message
          : 'Something went wrong. Try again in a moment.',
      );
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  }

  const personas = demo ? demo.personas.filter((p) => showAll || p.featured) : [];

  return (
    <>
      <div>
        <h1 className="auth-title">Sign in</h1>
        <div className="muted" style={{ marginTop: 4 }}>
          Use your work email or username.
        </div>
      </div>

      <form className="stack g3" onSubmit={onSubmit} noValidate>
        {error && (
          <div className="callout danger" role="alert" id="login-error">
            <Icon name="warning" />
            <div className="grow">{error}</div>
          </div>
        )}
        <Field label="Email or username" htmlFor="identifier">
          <TextInput
            lg
            id="identifier"
            name="identifier"
            autoComplete="username"
            placeholder="name@organisation.co.uk"
            value={identifier}
            invalid={!!error}
            aria-describedby={error ? 'login-error' : undefined}
            onChange={(e) => {
              setIdentifier(e.target.value);
              setSelected(null);
            }}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <TextInput
            lg
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            invalid={!!error}
            aria-describedby={error ? 'login-error' : undefined}
            onChange={(e) => setPassword(e.target.value)}
            end={
              <button
                type="button"
                className="end sm medium"
                style={{ color: 'var(--primary-text)' }}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? 'Hide' : 'Show'}
                <span className="sr-only"> password</span>
              </button>
            }
          />
        </Field>
        <div className="row between sm">
          <Checkbox
            label="Keep me signed in"
            checked={keepSignedIn}
            onChange={(e) => setKeepSignedIn(e.target.checked)}
          />
          <Link className="medium" href="/forgot-password">
            Forgot password?
          </Link>
        </div>
        <Button ref={submitRef} type="submit" variant="primary" size="lg" block disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {demo && (
        <section aria-labelledby="demo-heading" className="col" style={{ gap: 10 }}>
          <div className="row demo-divider">
            <span className="grow rule" />
            <h2 id="demo-heading" className="demo-heading">
              Demo accounts
            </h2>
            <span className="grow rule" />
          </div>
          <span className="sm muted">
            Click a role to fill in its details. Password for all: <span className="code">{demo.password}</span>
          </span>
          <div className="grid g-2" style={{ gap: 8 }}>
            {personas.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`demo-card ${selected === p.key ? 'on' : ''}`}
                aria-pressed={selected === p.key}
                onClick={() => fill(p)}
              >
                <span className="row between">
                  <span className="r">
                    <span style={{ color: 'var(--primary)' }}>
                      <Icon name={ICONS[p.key] ?? 'user'} size={14} />
                    </span>
                    {p.roleLabel}
                    <span className="sr-only">: {p.name}</span>
                  </span>
                  <span className="u">{p.email}</span>
                </span>
                <span className="xs faint">{p.description}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="link sm medium"
            aria-expanded={showAll}
            onClick={() => setShowAll((s) => !s)}
          >
            {showAll ? 'Show fewer demo roles ▴' : `Show all ${demo.personas.length} demo roles ▾`}
          </button>
          <div className="sr-only" aria-live="polite">
            {announce}
          </div>
        </section>
      )}
    </>
  );
}
