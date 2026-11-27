'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@fmstead/ui';
import type { Team } from '@fmstead/shared';
import { adminWrite } from '@/lib/admin-client';
import styles from '../admin.module.css';

type Person = { id: string; name: string };

function MemberPicker({
  legend,
  people,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  people: Person[];
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className={styles.members} disabled={disabled}>
      <legend className="sm medium">{legend}</legend>
      {people.map((p) => (
        <label key={p.id} className="row g2">
          <input
            type="checkbox"
            className="cb"
            checked={value.has(p.id)}
            onChange={(e) => {
              const next = new Set(value);
              if (e.target.checked) next.add(p.id);
              else next.delete(p.id);
              onChange(next);
            }}
          />
          {p.name}
        </label>
      ))}
    </fieldset>
  );
}

function TeamCard({
  team,
  people,
  canManage,
  run,
  busy,
}: {
  team: Team;
  people: Person[];
  canManage: boolean;
  run: (action: () => Promise<unknown>, done: string) => Promise<boolean>;
  busy: boolean;
}) {
  const [members, setMembers] = useState(() => new Set(team.members.map((m) => m.membershipId)));
  const titleId = useId();
  // Someone deactivated since joining stays listed, so they can be removed.
  const choices = [
    ...people,
    ...team.members
      .filter((m) => !people.some((p) => p.id === m.membershipId))
      .map((m) => ({ id: m.membershipId, name: m.name })),
  ];
  const changed = members.size !== team.members.length || team.members.some((m) => !members.has(m.membershipId));
  return (
    <section className="card" aria-labelledby={titleId}>
      <div className="card-h">
        <h2 className="card-t" id={titleId}>
          {team.name}
        </h2>
        <span className="faint sm">
          {team.members.length} {team.members.length === 1 ? 'person' : 'people'}
        </span>
      </div>
      <div className="card-b stack g2">
        {team.description && <p className="muted">{team.description}</p>}
        {canManage ? (
          <>
            <MemberPicker
              legend={`Members of ${team.name}`}
              people={choices}
              value={members}
              onChange={setMembers}
              disabled={busy}
            />
            <div className="row wrap g2">
              <Button
                variant="primary"
                disabled={busy || !changed}
                onClick={() =>
                  run(
                    () => adminWrite('/teams/' + team.id, { memberIds: [...members] }, 'PATCH'),
                    `${team.name} updated.`,
                  )
                }
              >
                Save members
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => run(() => adminWrite('/teams/' + team.id, undefined, 'DELETE'), `${team.name} deleted.`)}
              >
                Delete team
              </Button>
            </div>
          </>
        ) : (
          <ul>
            {team.members.map((m) => (
              <li key={m.membershipId}>
                {m.name} <span className="faint sm">· {m.roleLabel}</span>
              </li>
            ))}
            {!team.members.length && <li className="muted">No one yet.</li>}
          </ul>
        )}
      </div>
    </section>
  );
}

export function TeamsManager({ teams, people, canManage }: { teams: Team[]; people: Person[]; canManage: boolean }) {
  const router = useRouter();
  const nameId = useId();
  const descId = useId();
  const [newMembers, setNewMembers] = useState(() => new Set<string>());
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const [busy, setBusy] = useState(false);

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

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const description = String(data.get('description') ?? '').trim();
    const ok = await run(
      () =>
        adminWrite('/teams', {
          name: data.get('name'),
          description: description || undefined,
          memberIds: [...newMembers],
        }),
      'Team created.',
    );
    if (ok) {
      form.reset();
      setNewMembers(new Set());
    }
  }

  return (
    <>
      {canManage && (
        <section className="card" aria-labelledby="new-team-title">
          <div className="card-h">
            <h2 className="card-t" id="new-team-title">
              New team
            </h2>
          </div>
          <form className="card-b stack g3" onSubmit={create}>
            <div className={styles.inviteForm}>
              <Field label="Team name" htmlFor={nameId}>
                <TextInput id={nameId} name="name" required maxLength={80} autoComplete="off" />
              </Field>
              <Field label="Description (optional)" htmlFor={descId}>
                <TextInput id={descId} name="description" maxLength={300} autoComplete="off" />
              </Field>
            </div>
            <MemberPicker
              legend="Members"
              people={people}
              value={newMembers}
              onChange={setNewMembers}
              disabled={busy}
            />
            <div>
              <Button type="submit" variant="primary" disabled={busy}>
                Create team
              </Button>
            </div>
          </form>
        </section>
      )}
      {feedback && (
        <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'field-error' : 'muted'}>
          {feedback.text}
        </p>
      )}
      {teams.map((team) => (
        <TeamCard
          key={team.id + team.members.map((m) => m.membershipId).join()}
          team={team}
          people={people}
          canManage={canManage}
          run={run}
          busy={busy}
        />
      ))}
      {!teams.length && <p className="muted">No teams yet.</p>}
    </>
  );
}
