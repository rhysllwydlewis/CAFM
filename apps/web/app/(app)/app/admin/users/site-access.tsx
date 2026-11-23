'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@cafm/ui';
import type { AdminUser, SiteAccessOverview } from '@cafm/shared';
import { adminWrite } from '@/lib/admin-client';
import styles from '../admin.module.css';

/**
 * Which sites each person can see (P1-09b). Organisation-wide admins can leave someone unrestricted or
 * limit them; a delegated admin (limited to sites themselves) can only choose among their own sites.
 */
export function SiteAccessCard({
  users,
  overview,
  selfMembershipId,
}: {
  users: AdminUser[];
  overview: SiteAccessOverview;
  selfMembershipId: string;
}) {
  const router = useRouter();
  const selectId = useId();
  const people = users.filter(
    (u) =>
      u.status === 'active' &&
      u.membershipId !== selfMembershipId &&
      u.role !== 'super_user' &&
      overview.members.some((m) => m.membershipId === u.membershipId),
  );
  const [personId, setPersonId] = useState(people[0]?.membershipId ?? '');
  const current = overview.members.find((m) => m.membershipId === personId);
  const areaIds = new Set(overview.areas.map((a) => a.id));
  const [limited, setLimited] = useState(current?.restricted ?? false);
  const [chosen, setChosen] = useState(() => new Set(current?.locationIds ?? []));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();

  function pick(id: string) {
    const next = overview.members.find((m) => m.membershipId === id);
    setPersonId(id);
    setLimited(next?.restricted ?? false);
    setChosen(new Set(next?.locationIds ?? []));
    setFeedback(undefined);
  }

  async function save() {
    setBusy(true);
    setFeedback(undefined);
    try {
      // Keep any access to levels this screen doesn't list (such as a single building) as it was.
      const kept = (current?.locationIds ?? []).filter((id) => !areaIds.has(id));
      await adminWrite(
        '/locations/access/' + personId,
        { locationIds: limited ? [...new Set([...chosen, ...kept])] : null },
        'PUT',
      );
      setFeedback({ text: 'Site access saved.' });
      router.refresh();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not save your changes.', error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="site-access-title">
      <div className="card-h">
        <h2 className="card-t" id="site-access-title">
          Site access
        </h2>
      </div>
      <div className="card-b stack g3">
        {overview.delegated && (
          <p className="muted sm">
            You manage people at your own sites. You can only choose among those sites, and people with access to other
            sites stay out of this list.
          </p>
        )}
        {!people.length ? (
          <p className="muted">No one to set up yet.</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor={selectId}>Person</label>
              <select
                className={styles.control}
                id={selectId}
                value={personId}
                disabled={busy}
                onChange={(e) => pick(e.target.value)}
              >
                {people.map((u) => (
                  <option key={u.membershipId} value={u.membershipId}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className={styles.members} disabled={busy}>
              <legend className="sm medium">What they can see</legend>
              {!overview.delegated && (
                <label className="row g2">
                  <input
                    type="radio"

                    name="site-access-mode"
                    checked={!limited}
                    onChange={() => setLimited(false)}
                  />
                  Every site in the organisation
                </label>
              )}
              <label className="row g2">
                <input
                  type="radio"

                  name="site-access-mode"
                  checked={limited || overview.delegated}
                  onChange={() => setLimited(true)}
                />
                Only the sites I choose
              </label>
            </fieldset>
            {(limited || overview.delegated) && (
              <fieldset className={styles.plain + ' stack g2'} disabled={busy}>
                <legend className="sm medium">Sites and regions</legend>
                <div className={styles.members}>
                  {overview.areas.map((a) => (
                    <label key={a.id} className="row g2">
                      <input
                        type="checkbox"
                        className="cb"
                        checked={chosen.has(a.id)}
                        onChange={(e) => {
                          const next = new Set(chosen);
                          if (e.target.checked) next.add(a.id);
                          else next.delete(a.id);
                          setChosen(next);
                        }}
                      />
                      {a.name} <span className="faint sm">· {a.kind === 'region' ? 'Region' : 'Site'}</span>
                    </label>
                  ))}
                  {!overview.areas.length && <span className="muted">No sites yet.</span>}
                </div>
              </fieldset>
            )}
            <div>
              <Button variant="primary" disabled={busy} onClick={save}>
                Save site access
              </Button>
            </div>
          </>
        )}
        {feedback && (
          <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'field-error' : 'muted'}>
            {feedback.text}
          </p>
        )}
      </div>
    </section>
  );
}
