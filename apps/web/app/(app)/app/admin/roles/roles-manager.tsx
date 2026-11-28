'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@fmstead/ui';
import { PERMISSIONS, isAdminPermission, type Permission } from '@fmstead/shared';
import { adminWrite } from '@/lib/admin-client';
import styles from '../admin.module.css';

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  scope: string;
  builtin: boolean;
  members: number;
};

const MODULE_LABELS: Record<string, string> = {
  people: 'People',
  roles: 'Roles',
  audit: 'Audit log',
  settings: 'Settings',
  billing: 'Billing',
  locations: 'Locations',
  assets: 'Assets',
  helpdesk: 'Helpdesk',
  work_orders: 'Work orders',
  ppm: 'Planned maintenance',
  finance: 'Costs',
  reports: 'Reports',
};

const SCOPE_LABELS: Record<string, string> = {
  all: 'All records',
  team: 'My team’s records',
  own: 'Own records only',
};

const ENTRIES = (Object.entries(PERMISSIONS) as [Permission, (typeof PERMISSIONS)[Permission]][]).map(
  ([key, meta]) => ({ key, label: meta.label, module: meta.module as string }),
);
const MODULES = [...new Set(ENTRIES.map((e) => e.module))];

export function RolesManager({
  roles,
  selected,
  canManage,
  held,
  notice,
}: {
  roles: RoleRow[];
  selected: string | undefined;
  canManage: boolean;
  held: string[];
  /** Confirmation carried across the navigation that follows create, duplicate and delete. */
  notice?: string;
}) {
  const router = useRouter();
  const nameId = useId();
  const descId = useId();
  const scopeId = useId();
  const newId = useId();
  const role = roles.find((r) => r.key === selected);
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [scope, setScope] = useState(role?.scope ?? 'all');
  const [permissions, setPermissions] = useState(() => new Set(role?.permissions ?? []));
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | undefined>(
    notice ? { text: notice } : undefined,
  );
  const [busy, setBusy] = useState(false);
  // The confirmation travels in the address so it survives the screen starting afresh. Once shown, take it out of the
  // address, so reloading the page does not show it again.
  useEffect(() => {
    if (!notice) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('notice');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [notice]);
  const locked = !canManage || role?.key === 'super_user';

  async function run<T>(action: () => Promise<T>, done: string): Promise<T | undefined> {
    setBusy(true);
    setFeedback(undefined);
    try {
      const result = await action();
      setFeedback({ text: done });
      router.refresh();
      return result;
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not save your changes.', error: true });
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  function toggle(key: string, on: boolean) {
    setPermissions((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!role) return;
    await run(
      () => adminWrite('/roles/' + role.id, { name, description, scope, permissions: [...permissions] }, 'PATCH'),
      'Role saved.',
    );
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get('name') ?? '');
    const created = await run(
      () => adminWrite<{ key: string }>('/roles', { name: title, permissions: ['people.read'], scope: 'all' }),
      'Role created.',
    );
    if (created) {
      form.reset();
      router.push('/app/admin/roles?notice=created&role=' + created.key);
    }
  }

  async function duplicate() {
    if (!role) return;
    const created = await run(
      () =>
        adminWrite<{ key: string }>('/roles', {
          name: `${role.name} copy`.slice(0, 80),
          description: description || undefined,
          permissions: [...permissions],
          scope,
        }),
      'Role duplicated.',
    );
    if (created) router.push('/app/admin/roles?notice=duplicated&role=' + created.key);
  }

  async function remove() {
    if (!role) return;
    const done = await run(() => adminWrite('/roles/' + role.id, undefined, 'DELETE'), 'Role deleted.');
    if (done !== undefined) router.push('/app/admin/roles?notice=deleted');
  }

  return (
    <div className={styles.rolesGrid}>
      <section className="card" aria-labelledby="roles-title">
        <div className="card-h">
          <h2 className="card-t" id="roles-title">
            Roles ({roles.length})
          </h2>
        </div>
        <div className={'card-b ' + styles.menu}>
          {roles.map((r) => (
            <Link
              key={r.key}
              href={'/app/admin/roles?role=' + r.key}
              aria-current={r.key === selected ? 'page' : undefined}
            >
              {r.name} <span className="faint sm">· {r.members}</span>
            </Link>
          ))}
        </div>
        {canManage && (
          <form className="card-b stack g2" onSubmit={create}>
            <Field label="New role" htmlFor={newId}>
              <TextInput id={newId} name="name" required maxLength={80} autoComplete="off" />
            </Field>
            <div>
              <Button type="submit" variant="secondary" disabled={busy}>
                Create role
              </Button>
            </div>
          </form>
        )}
      </section>
      {role && (
        <form className="stack g4" onSubmit={save} aria-label={'Role: ' + role.name}>
          <section className="card" aria-labelledby="role-title">
            <div className="card-h">
              <h2 className="card-t" id="role-title">
                Role: {role.name}
              </h2>
              <span className="faint sm">
                {role.members} {role.members === 1 ? 'person' : 'people'} ·{' '}
                {role.builtin ? 'built-in role' : 'custom role'}
              </span>
            </div>
            <div className={'card-b ' + styles.inviteForm}>
              <Field label="Name" htmlFor={nameId}>
                <TextInput
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={locked}
                  maxLength={80}
                />
              </Field>
              <Field label="Description" htmlFor={descId}>
                <TextInput
                  id={descId}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={locked}
                  maxLength={300}
                />
              </Field>
              <Field label="Data scope" htmlFor={scopeId}>
                <select
                  className={styles.control}
                  id={scopeId}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  disabled={locked}
                >
                  {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>
          <section className="card" aria-labelledby="perm-title">
            <div className="card-h">
              <h2 className="card-t" id="perm-title">
                Permissions
              </h2>
              <span className="faint sm">
                {permissions.size} of {ENTRIES.length} on
              </span>
            </div>
            <div className={'card-b flush ' + styles.tableWrap} role="region" aria-labelledby="perm-title" tabIndex={0}>
              <table className="tbl dense" aria-labelledby="perm-title">
                <thead>
                  <tr>
                    <th>Area and permission</th>
                    <th style={{ textAlign: 'center' }}>Allowed</th>
                  </tr>
                </thead>
                {MODULES.map((module) => (
                  <tbody key={module}>
                    <tr>
                      <th colSpan={2} scope="colgroup" className="medium">
                        {MODULE_LABELS[module] ?? module}
                      </th>
                    </tr>
                    {ENTRIES.filter((e) => e.module === module).map((e) => {
                      const cannotGrant = !held.includes(e.key);
                      return (
                        <tr key={e.key}>
                          <td>
                            <label htmlFor={'perm-' + e.key}>{e.label}</label>
                            {isAdminPermission(e.key) && <span className="badge"> Admin</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              id={'perm-' + e.key}
                              type="checkbox"
                              className="cb"
                              checked={permissions.has(e.key)}
                              disabled={locked || (cannotGrant && !permissions.has(e.key))}
                              onChange={(ev) => toggle(e.key, ev.target.checked)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
            <div className="card-b stack g2">
              <p className="faint sm">
                You can only grant permissions you hold yourself. Every change is recorded in the audit log.
              </p>
              {role.key === 'super_user' && <p className="muted">The Super User role always has every permission.</p>}
              {feedback && (
                <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'field-error' : 'muted'}>
                  {feedback.text}
                </p>
              )}
              {canManage && (
                <div className="row wrap g2">
                  <Button type="submit" variant="primary" disabled={busy || locked}>
                    Save role
                  </Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={duplicate}>
                    Duplicate
                  </Button>
                  {!role.builtin && (
                    <Button type="button" variant="secondary" disabled={busy || role.members > 0} onClick={remove}>
                      Delete role
                    </Button>
                  )}
                </div>
              )}
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
