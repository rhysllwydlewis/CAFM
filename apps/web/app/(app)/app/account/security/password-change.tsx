'use client';

import { useState, type FormEvent } from 'react';
import { Button, Field, Icon, TextInput } from '@fmstead/ui';
import { postJson } from '@/lib/client';

/** What the API said was wrong, when it gave a reason the person can act on. */
async function problem(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
  return [422, 429].includes(res.status) && message ? message : 'Something went wrong. Try again in a moment.';
}

/** The signed-in person changes their own password (mockup auth-08-account-security, issue #89). */
export function PasswordChange({ locked }: { locked: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    if (next !== confirm) {
      setError('The new passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await postJson('/auth/password', { currentPassword: current, newPassword: next });
      if (res.ok) {
        setCurrent('');
        setNext('');
        setConfirm('');
        setDone(true);
      } else setError(await problem(res));
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  }

  return (
    <section className="card" aria-labelledby="password-title">
      <div className="card-h">
        <h2 className="card-t" id="password-title">
          Change your password
        </h2>
      </div>
      <form className="card-b stack g3" onSubmit={submit} noValidate>
        <p className="muted">You will stay signed in here. Every other device is signed out.</p>
        {locked && (
          <div className="callout" role="note">
            <Icon name="info" />
            <div className="grow">This is part of the demo and can’t be changed. The demo resets every night.</div>
          </div>
        )}
        {error && (
          <div className="callout danger" role="alert" id="password-error">
            <Icon name="warning" />
            <div className="grow">{error}</div>
          </div>
        )}
        {done && (
          <div className="callout" role="status">
            <Icon name="check" />
            <div className="grow">Your password has been changed. Other devices have been signed out.</div>
          </div>
        )}
        <Field label="Current password" htmlFor="password-current">
          <TextInput
            id="password-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="New password" htmlFor="password-new">
          <TextInput
            id="password-new"
            type="password"
            autoComplete="new-password"
            aria-describedby="password-new-hint"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <span className="hint" id="password-new-hint">
            At least 12 characters. Avoid common passwords.
          </span>
        </Field>
        <Field label="Confirm new password" htmlFor="password-confirm">
          <TextInput
            id="password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={busy || locked || !current || !next || !confirm}>
            Change password
          </Button>
        </div>
      </form>
    </section>
  );
}
