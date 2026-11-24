'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Field, TextInput } from '@cafm/ui';
import {
  PASSWORD_MIN_CEILING,
  PASSWORD_MIN_FLOOR,
  SESSION_HOURS_MAX,
  SESSION_HOURS_MIN,
  type SecuritySettingsView,
} from '@cafm/shared';
import { adminWrite } from '@/lib/admin-client';

/** Security and sign-in: password length, how long a sign-in lasts, and MFA (admin-08-security). */
export function SecurityManager({ settings }: { settings: SecuritySettingsView }) {
  const router = useRouter();
  const [length, setLength] = useState(String(settings.passwordMinLength));
  const [hours, setHours] = useState(settings.sessionTimeoutHours === null ? '' : String(settings.sessionTimeoutHours));
  const [mfa, setMfa] = useState(settings.mfaRequired);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();

  const lengthNumber = Number(length);
  const lengthError =
    !Number.isInteger(lengthNumber) || lengthNumber < PASSWORD_MIN_FLOOR || lengthNumber > PASSWORD_MIN_CEILING
      ? `Use a whole number from ${PASSWORD_MIN_FLOOR} to ${PASSWORD_MIN_CEILING}.`
      : undefined;
  const hoursNumber = Number(hours);
  const hoursError =
    hours.trim() !== '' &&
    (!Number.isInteger(hoursNumber) || hoursNumber < SESSION_HOURS_MIN || hoursNumber > SESSION_HOURS_MAX)
      ? `Use a whole number of hours from ${SESSION_HOURS_MIN} to ${SESSION_HOURS_MAX}, or leave it empty.`
      : undefined;

  async function save() {
    if (lengthError || hoursError) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      await adminWrite(
        '/admin/security',
        {
          passwordMinLength: lengthNumber,
          sessionTimeoutHours: hours.trim() === '' ? null : hoursNumber,
          mfaRequired: mfa,
        },
        'PUT',
      );
      setFeedback({ text: 'Security settings saved.' });
      router.refresh();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not save your changes.', error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="security-title">
      <div className="card-h">
        <h2 className="card-t" id="security-title">
          Security and sign-in
        </h2>
        <Button variant="primary" onClick={save} disabled={busy || !!lengthError || !!hoursError}>
          Save
        </Button>
      </div>
      <div className="card-b stack g3">
        <p className="muted">
          Applies to everyone in your organisation. Single sign-on, IP allow-lists and breached-password checks are not
          built yet.
        </p>
        <Field label="Minimum password length" htmlFor="sec-length" error={lengthError}>
          <TextInput
            id="sec-length"
            inputMode="numeric"
            value={length}
            invalid={!!lengthError}
            aria-describedby={lengthError ? 'sec-length-error' : 'sec-length-hint'}
            onChange={(e) => setLength(e.target.value)}
            disabled={busy}
          />
        </Field>
        <p className="faint sm" id="sec-length-hint">
          Applies when someone sets or resets a password. {PASSWORD_MIN_FLOOR} is the lowest the system allows.
        </p>
        <Field label="Longest sign-in, in hours" htmlFor="sec-hours" error={hoursError}>
          <TextInput
            id="sec-hours"
            inputMode="numeric"
            value={hours}
            placeholder="Standard"
            invalid={!!hoursError}
            aria-describedby={hoursError ? 'sec-hours-error' : 'sec-hours-hint'}
            onChange={(e) => setHours(e.target.value)}
            disabled={busy}
          />
        </Field>
        <p className="faint sm" id="sec-hours-hint">
          Empty keeps the standard: 12 hours, or 30 days with “Keep me signed in”. A limit only shortens a sign-in, and
          applies to new sign-ins.
        </p>
        <Checkbox
          label="Require multi-factor authentication"
          checked={mfa}
          onChange={(e) => setMfa(e.target.checked)}
          disabled={busy}
        />
        <p className="faint sm">
          Saved now. It is enforced when authenticator-app sign-in is released, so nobody is locked out before they can
          set it up.
        </p>
        <p role="status" className={feedback?.error ? 'field-error' : 'muted'}>
          {feedback?.text}
        </p>
      </div>
    </section>
  );
}
