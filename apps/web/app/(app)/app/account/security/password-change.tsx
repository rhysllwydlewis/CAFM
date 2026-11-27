'use client';

import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Field, Icon, TextInput } from '@fmstead/ui';
import { postJson } from '@/lib/client';

type FieldName = 'current' | 'next' | 'confirm';
const FIELD_IDS: Record<FieldName, string> = {
  current: 'password-current',
  next: 'password-new',
  confirm: 'password-confirm',
};

/** Which field a reason from the API belongs to, or none when it is about the request as a whole. */
function fieldFor(code: string | undefined): FieldName | null {
  if (code === 'wrong_current_password') return 'current';
  if (code === 'weak_password' || code === 'same_password') return 'next';
  return null;
}

async function reason(res: Response): Promise<{ field: FieldName | null; message: string }> {
  const body = (await res.json().catch(() => null)) as { code?: string; message?: string | string[] } | null;
  const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
  if (res.status === 401)
    return { field: null, message: 'You have been signed out. Sign in again to change your password.' };
  if ([422, 429].includes(res.status) && message) return { field: fieldFor(body?.code), message };
  return { field: null, message: 'Something went wrong. Try again in a moment.' };
}

/** The signed-in person changes their own password (mockup auth-08-account-security, issue #89). */
export function PasswordChange({ locked, minLength }: { locked: boolean; minLength: number }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Shows what is wrong beside its field and puts the cursor there, so it is read out and easy to fix. */
  function fail(field: FieldName | null, message: string) {
    setDone(false);
    if (field) {
      setErrors({ [field]: message });
      setGeneral(null);
      document.getElementById(FIELD_IDS[field])?.focus();
    } else {
      setErrors({});
      setGeneral(message);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < minLength) return fail('next', `Use at least ${minLength} characters.`);
    if (next !== confirm) return fail('confirm', 'The new passwords don’t match.');
    setBusy(true);
    setErrors({});
    setGeneral(null);
    setDone(false);
    try {
      const res = await postJson('/auth/password', { currentPassword: current, newPassword: next });
      if (res.ok) {
        setCurrent('');
        setNext('');
        setConfirm('');
        setDone(true);
      } else {
        const { field, message } = await reason(res);
        fail(field, message);
      }
    } catch {
      fail(null, 'We could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  }

  const type = show ? 'text' : 'password';
  const field = (name: FieldName, extra?: string) => ({
    id: FIELD_IDS[name],
    type,
    invalid: !!errors[name],
    'aria-describedby':
      [errors[name] ? `${FIELD_IDS[name]}-error` : null, extra].filter(Boolean).join(' ') || undefined,
  });

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
        {general && (
          <div className="callout danger" role="alert" id="password-error">
            <Icon name="warning" />
            <div className="grow">{general}</div>
          </div>
        )}
        {done && (
          <div className="callout" role="status">
            <Icon name="check" />
            <div className="grow">Your password has been changed. Other devices have been signed out.</div>
          </div>
        )}
        <Field label="Current password" htmlFor={FIELD_IDS.current} error={errors.current}>
          <TextInput
            {...field('current')}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="New password" htmlFor={FIELD_IDS.next} error={errors.next}>
          <TextInput
            {...field('next', 'password-new-hint')}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <span className="hint" id="password-new-hint">
            At least {minLength} characters. Avoid common passwords.
          </span>
        </Field>
        <Field label="Confirm new password" htmlFor={FIELD_IDS.confirm} error={errors.confirm}>
          <TextInput
            {...field('confirm')}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Checkbox label="Show passwords" checked={show} onChange={(e) => setShow(e.target.checked)} />
        <div>
          <Button type="submit" variant="primary" disabled={busy || locked || !current || !next || !confirm}>
            Change password
          </Button>
        </div>
      </form>
    </section>
  );
}
