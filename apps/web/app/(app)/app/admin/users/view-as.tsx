'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button, Field, TextInput } from '@cafm/ui';
import type { AdminUser } from '@cafm/shared';
import { adminWrite } from '@/lib/admin-client';
import styles from '../admin.module.css';

/**
 * "View as user" (P1-09c): see the app as someone else sees it, to troubleshoot. It is read-only, lasts an
 * hour, needs a reason and is recorded in the audit log. Super Users can't be chosen.
 */
export function ViewAsCard({ users, selfMembershipId }: { users: AdminUser[]; selfMembershipId: string }) {
  const personId = useId();
  const reasonId = useId();
  const people = users.filter(
    (u) => u.status === 'active' && u.membershipId !== selfMembershipId && u.role !== 'super_user',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      const res = await adminWrite<{ landingPage: string }>('/admin/impersonation', {
        membershipId: data.get('person'),
        reason: data.get('reason'),
      });
      window.location.assign(res?.landingPage ?? '/app');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start viewing as that person.');
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="view-as-title">
      <div className="card-h">
        <h2 className="card-t" id="view-as-title">
          View as user
        </h2>
      </div>
      <form className="card-b stack g3" onSubmit={start}>
        <p className="muted">
          See the app as someone else sees it. You can look but not change anything, it ends after an hour, and it is
          recorded in the audit log with your reason.
        </p>
        <Field label="Person" htmlFor={personId}>
          <select className={styles.control} id={personId} name="person" required defaultValue="">
            <option value="" disabled>
              Choose a person
            </option>
            {people.map((u) => (
              <option key={u.membershipId} value={u.membershipId}>
                {u.name} ({u.roleLabel})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason" htmlFor={reasonId}>
          <TextInput
            id={reasonId}
            name="reason"
            required
            minLength={3}
            maxLength={200}
            autoComplete="off"
            placeholder="For example, checking why the app won’t sync"
          />
        </Field>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" variant="secondary" disabled={busy}>
            View as this person
          </Button>
        </div>
      </form>
    </section>
  );
}
