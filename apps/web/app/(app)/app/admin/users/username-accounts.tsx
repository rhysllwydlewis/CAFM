'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@cafm/ui';
import type { AdminUser, UsernameAccountCredentials } from '@cafm/shared';
import { adminWrite } from '@/lib/admin-client';
import styles from '../admin.module.css';
import type { RoleOption } from './users-manager';

/**
 * Username-only accounts (P1-09f): for staff without an email address, such as operatives on shared devices.
 * The password is shown once, here, and can't be read again. Resetting makes a new one.
 */
export function UsernameAccountsCard({
  users,
  roles,
  canCreate,
}: {
  users: AdminUser[];
  roles: RoleOption[];
  /** Organisation-wide admins only: a new account carries no site. Resetting is open to delegated admins too. */
  canCreate: boolean;
}) {
  const router = useRouter();
  const nameId = useId();
  const usernameId = useId();
  const roleId = useId();
  const personId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [issued, setIssued] = useState<UsernameAccountCredentials>();
  const [reset, setReset] = useState(false);
  const accounts = users.filter((u) => u.username && !u.email && u.status === 'active');

  async function submit(call: () => Promise<UsernameAccountCredentials | null>, afterwards?: () => void) {
    setBusy(true);
    setError(undefined);
    try {
      const credentials = await call();
      if (credentials) setIssued(credentials);
      afterwards?.();
      router.refresh();
    } catch (e) {
      setIssued(undefined);
      setError(e instanceof Error ? e.message : 'Could not save your changes.');
    } finally {
      setBusy(false);
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setReset(false);
    return submit(
      () =>
        adminWrite<UsernameAccountCredentials>('/admin/username-accounts', {
          name: data.get('name'),
          username: data.get('username'),
          role: data.get('role'),
        }),
      () => form.reset(),
    );
  }

  function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const membershipId = new FormData(event.currentTarget).get('person');
    setReset(true);
    return submit(() =>
      adminWrite<UsernameAccountCredentials>(`/admin/username-accounts/${membershipId}/reset-password`, {}),
    );
  }

  return (
    <section className="card" aria-labelledby="username-title">
      <div className="card-h">
        <h2 className="card-t" id="username-title">
          Accounts with a username only
        </h2>
      </div>
      <div className="card-b stack g3">
        <p className="muted">
          For staff without an email address. They sign in with a username on your organisation’s own sign-in page.
          There is no email, so you give them the password, and you reset it if they forget it.
        </p>
        {canCreate && (
          <form className={styles.inviteForm} onSubmit={create}>
            <Field label="Name" htmlFor={nameId}>
              <TextInput id={nameId} name="name" required autoComplete="off" />
            </Field>
            <Field label="Username" htmlFor={usernameId}>
              <TextInput
                id={usernameId}
                name="username"
                required
                autoComplete="off"
                autoCapitalize="none"
                aria-describedby={usernameId + '-hint'}
              />
              <span className="xs faint" id={usernameId + '-hint'}>
                3 to 32 letters, numbers, dots, dashes or underscores.
              </span>
            </Field>
            <Field label="Role" htmlFor={roleId}>
              <select className={styles.control} id={roleId} name="role" required defaultValue="">
                <option value="" disabled>
                  Choose a role
                </option>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <Button type="submit" variant="primary" disabled={busy}>
                Create account
              </Button>
            </div>
          </form>
        )}
        {accounts.length > 0 && (
          <form className={styles.inviteForm} onSubmit={resetPassword}>
            <Field label="Reset a password" htmlFor={personId}>
              <select className={styles.control} id={personId} name="person" required defaultValue="">
                <option value="" disabled>
                  Choose a person
                </option>
                {accounts.map((u) => (
                  <option key={u.membershipId} value={u.membershipId}>
                    {u.name} ({u.username})
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <Button type="submit" variant="secondary" disabled={busy}>
                Reset password
              </Button>
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {issued && (
          <div className="callout" role="status">
            <div className="grow stack g2">
              <b>{reset ? `New password for ${issued.name}` : `Account created for ${issued.name}`}</b>
              <div>
                Username: <span className="code">{issued.username}</span>
              </div>
              <div>
                Password: <span className="code">{issued.temporaryPassword}</span>
              </div>
              <div>
                Sign-in page: <span className="code">{issued.signInPath}</span>
              </div>
              <div className="sm muted">Copy this now. It won’t be shown again.</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
