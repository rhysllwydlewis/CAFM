'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@cafm/ui';
import type { AdminUser, SiteAccessOverview } from '@cafm/shared';
import { adminWrite } from '@/lib/admin-client';
import styles from '../admin.module.css';
import { SiteAccessCard } from './site-access';
import { UsernameAccountsCard } from './username-accounts';
import { ViewAsCard } from './view-as';

export type RoleOption = { key: string; name: string };
export type PendingInvite = { id: string; email: string; role: string; expiresAt: string };

const LICENCES: Record<string, string> = {
  full: 'Full',
  mobile: 'Mobile',
  contractor: 'Contractor',
  requester: 'Requester',
  client: 'Client',
  read_only: 'Read-only',
};

function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(
        new Date(value),
      )
    : 'Never';
}

export function UsersManager({
  users,
  roles,
  invites,
  canInvite,
  selfMembershipId,
  siteAccess,
  canEditSiteAccess,
  canViewAs,
}: {
  users: AdminUser[];
  roles: RoleOption[];
  invites: PendingInvite[];
  canInvite: boolean;
  selfMembershipId: string;
  siteAccess: SiteAccessOverview;
  /** Delegated admins, or organisations-wide admins who also hold `locations.manage`. */
  canEditSiteAccess: boolean;
  /** Holds `people.impersonate` (Super Users). */
  canViewAs: boolean;
}) {
  const router = useRouter();
  const emailId = useId();
  const roleId = useId();
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);

  async function run(action: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    setFeedback(undefined);
    try {
      await action();
      setFeedback({ text: done });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not save your changes.', error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const sent = await run(
      () => adminWrite('/people/invites', { email: data.get('email'), role: data.get('role') }),
      'Invitation sent.',
    );
    if (sent) form.reset();
  }

  const shown = users.filter((u) => {
    if (!showAll && u.status !== 'active') return false;
    const text = filter.trim().toLowerCase();
    return !text || [u.name, u.email ?? '', u.username ?? ''].some((v) => v.toLowerCase().includes(text));
  });

  return (
    <>
      {canInvite && (
        <section className="card" aria-labelledby="invite-title">
          <div className="card-h">
            <h2 className="card-t" id="invite-title">
              Invite someone
            </h2>
          </div>
          <form className={'card-b ' + styles.inviteForm} onSubmit={invite}>
            <Field label="Email address" htmlFor={emailId}>
              <TextInput id={emailId} name="email" type="email" required autoComplete="off" />
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
                Send invitation
              </Button>
            </div>
          </form>
        </section>
      )}
      <UsernameAccountsCard users={users} roles={roles} canCreate={!siteAccess.delegated} />
      {feedback && (
        <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'field-error' : 'muted'}>
          {feedback.text}
        </p>
      )}
      {invites.length > 0 && (
        <section className="card" aria-labelledby="pending-title">
          <div className="card-h">
            <h2 className="card-t" id="pending-title">
              Pending invitations ({invites.length})
            </h2>
          </div>
          <div className={'card-b flush ' + styles.tableWrap}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Expires</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td>{roles.find((r) => r.key === i.role)?.name ?? i.role}</td>
                    <td>{date(i.expiresAt)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(() => adminWrite('/people/invites/' + i.id, undefined, 'DELETE'), 'Invitation withdrawn.')
                        }
                      >
                        Withdraw
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="card" aria-labelledby="people-title">
        <div className="card-h">
          <h2 className="card-t" id="people-title">
            People ({shown.length})
          </h2>
        </div>
        <div className="card-b row wrap g3">
          <label className="sr-only" htmlFor="user-filter">
            Search people
          </label>
          <TextInput
            id="user-filter"
            type="search"
            placeholder="Name, email or username"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <label className="row g2">
            <input type="checkbox" className="cb" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Include deactivated
          </label>
        </div>
        <div className={'card-b flush ' + styles.tableWrap}>
          <table className="tbl" aria-labelledby="people-title">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Licence</th>
                <th>Last sign-in</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => {
                const self = u.membershipId === selfMembershipId;
                return (
                  <tr key={u.membershipId}>
                    <td>
                      <div className="medium">{u.name}</div>
                      <div className="faint sm">{u.email ?? `username: ${u.username}`}</div>
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={'role-' + u.membershipId}>
                        Role for {u.name}
                      </label>
                      <select
                        className={styles.control}
                        id={'role-' + u.membershipId}
                        value={u.role}
                        disabled={busy || self}
                        onChange={(e) =>
                          run(
                            () => adminWrite('/people/' + u.membershipId, { role: e.target.value }, 'PATCH'),
                            `${u.name}’s role changed.`,
                          )
                        }
                      >
                        {!roles.some((r) => r.key === u.role) && <option value={u.role}>{u.roleLabel}</option>}
                        {roles.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{LICENCES[u.licence] ?? u.licence}</td>
                    <td>{date(u.lastSignIn)}</td>
                    <td>
                      <span className={'badge ' + (u.status === 'active' ? 'success' : '')}>
                        {u.status === 'active' ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td>
                      {!self && (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          aria-label={`Reset two-step verification for ${u.name}`}
                          onClick={() =>
                            run(
                              () => adminWrite('/people/' + u.membershipId + '/mfa/reset', {}),
                              `Two-step verification reset for ${u.name}. They set it up again at their next sign-in if it is required.`,
                            )
                          }
                        >
                          Reset two-step
                        </Button>
                      )}
                      {!self && (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                adminWrite(
                                  '/people/' + u.membershipId,
                                  { status: u.status === 'active' ? 'deactivated' : 'active' },
                                  'PATCH',
                                ),
                              u.status === 'active' ? `${u.name} deactivated.` : `${u.name} reactivated.`,
                            )
                          }
                        >
                          {u.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!shown.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    No one matches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {canEditSiteAccess && (
        <SiteAccessCard
          key={
            users
              .filter((u) => u.status === 'active')
              .map((u) => u.membershipId)
              .join() + siteAccess.members.map((m) => m.membershipId + m.restricted + m.locationIds.join()).join('|')
          }
          users={users}
          overview={siteAccess}
          selfMembershipId={selfMembershipId}
        />
      )}
      {canViewAs && <ViewAsCard users={users} selfMembershipId={selfMembershipId} />}
    </>
  );
}
