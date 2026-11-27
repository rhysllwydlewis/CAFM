'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Button, Field, Icon, TextInput } from '@fmstead/ui';
import type { MfaEnrolment, MfaStatus } from '@fmstead/shared';
import { postJson } from '@/lib/client';

async function problem(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
  return res.status === 401 && message ? message : 'Something went wrong. Try again in a moment.';
}

/** Two-step verification for the signed-in person (mockups auth-06-mfa-setup and auth-07-mfa-recovery-codes). */
export function MfaSetup({
  status,
  locked,
  doneHref,
}: {
  status: MfaStatus;
  locked: boolean;
  /** Where to go once the recovery codes are saved (the required set-up page sends people on into the app). */
  doneHref?: string;
}) {
  const router = useRouter();
  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<Response>, done: (res: Response) => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      if (res.ok) await done(res);
      else setError(await problem(res));
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  }

  const start = () =>
    run(
      () => postJson('/auth/mfa/enrol'),
      async (res) => setEnrolment((await res.json()) as MfaEnrolment),
    );

  function confirm(e: FormEvent) {
    e.preventDefault();
    return run(
      () => postJson('/auth/mfa/confirm', { code: code.replace(/\s+/g, '') }),
      async (res) => {
        setCodes(((await res.json()) as { recoveryCodes: string[] }).recoveryCodes);
        setEnrolment(null);
        setCode('');
        // On the required set-up page a refresh would send the person on before they have saved the codes.
        if (!doneHref) router.refresh();
      },
    );
  }

  const regenerate = () =>
    run(
      () => postJson('/auth/mfa/recovery-codes', { password }),
      async (res) => {
        setCodes(((await res.json()) as { recoveryCodes: string[] }).recoveryCodes);
        setPassword('');
        router.refresh();
      },
    );

  const turnOff = () =>
    run(
      () => postJson('/auth/mfa/disable', { password }),
      async () => {
        setPassword('');
        router.refresh();
      },
    );

  const alert = error && (
    <div className="callout danger" role="alert" id="mfa-setup-error">
      <Icon name="warning" />
      <div className="grow">{error}</div>
    </div>
  );

  if (codes) {
    return (
      <section className="card" aria-labelledby="mfa-title">
        <div className="card-h">
          <h2 className="card-t" id="mfa-title">
            Save your recovery codes
          </h2>
        </div>
        <div className="card-b stack g3">
          <p className="muted">Each code works once, if you lose your phone. They are shown only now.</p>
          <div className="callout warning">
            <Icon name="warning" />
            <div className="grow">Keep them somewhere safe, such as a password manager.</div>
          </div>
          <ul className="grid g-2" aria-label="Recovery codes">
            {codes.map((c) => (
              <li key={c} style={{ fontFamily: 'var(--font-mono)' }}>
                {c}
              </li>
            ))}
          </ul>
          <div>
            <Button
              variant="primary"
              onClick={() => {
                setCodes(null);
                if (doneHref) router.push(doneHref);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (locked) {
    return (
      <section className="card" aria-labelledby="mfa-title">
        <div className="card-h">
          <h2 className="card-t" id="mfa-title">
            Two-step verification
          </h2>
        </div>
        <div className="card-b">
          <p className="muted">Shared demo accounts can’t change their two-step verification.</p>
        </div>
      </section>
    );
  }

  if (enrolment) {
    return (
      <section className="card" aria-labelledby="mfa-title">
        <div className="card-h">
          <h2 className="card-t" id="mfa-title">
            Set up two-step verification
          </h2>
        </div>
        <form className="card-b stack g3" onSubmit={confirm} noValidate>
          <p className="muted">
            Use an authenticator app such as Microsoft Authenticator, Google Authenticator or 1Password.
          </p>
          {alert}
          <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
            <QRCodeSVG value={enrolment.otpauthUri} level="M" marginSize={4} size={132} title="QR code for your app" />
            <div className="stack g2 grow">
              <div>1. Scan the code with the app, or enter this key by hand.</div>
              <div className="medium" style={{ fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>
                {enrolment.secret}
              </div>
            </div>
          </div>
          <Field label="2. Enter the 6-digit code the app shows" htmlFor="mfa-confirm">
            <TextInput
              lg
              id="mfa-confirm"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              invalid={!!error}
              aria-describedby={error ? 'mfa-setup-error' : undefined}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" block disabled={busy}>
            {busy ? 'Checking…' : 'Turn on two-step verification'}
          </Button>
        </form>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="mfa-title">
      <div className="card-h">
        <h2 className="card-t" id="mfa-title">
          Two-step verification
        </h2>
      </div>
      <div className="card-b stack g3">
        {alert}
        {status.enabled ? (
          <>
            <p className="muted">
              On. You need a code from your authenticator app, as well as your password, to sign in.{' '}
              {status.recoveryCodesLeft} recovery {status.recoveryCodesLeft === 1 ? 'code' : 'codes'} left.
            </p>
            <Field label="Your password, to change this" htmlFor="mfa-password">
              <TextInput
                id="mfa-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="row">
              <Button onClick={regenerate} disabled={busy || !password}>
                Make new recovery codes
              </Button>
              <Button variant="danger" onClick={turnOff} disabled={busy || !password}>
                Turn off
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Off. Turn it on to ask for a code from an authenticator app each time you sign in, so a stolen password is
              not enough.
            </p>
            <div>
              <Button variant="primary" onClick={start} disabled={busy}>
                Set up
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
