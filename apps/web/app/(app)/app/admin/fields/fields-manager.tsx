'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Field, TextInput } from '@fmstead/ui';
import {
  ENTITY_TYPES,
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  keyFromLabel,
  optionsFromLabels,
  type FieldType,
} from '@fmstead/config-engine';
import { adminWrite } from '@/lib/admin-client';
import styles from '../admin.module.css';
import type { AdminField } from './page';

const ENTITY_LABELS: Record<string, string> = {
  request: 'Requests',
  work_order: 'Work orders',
  asset: 'Assets',
  location: 'Locations',
  ppm_schedule: 'Planned maintenance schedules',
  contractor: 'Contractors',
  person: 'People',
};

/** Custom fields: add, rename, require and deactivate fields on each record type. */
export function FieldsManager({ fields, limit }: { fields: AdminField[]; limit: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const [editing, setEditing] = useState<AdminField>();
  const [entityType, setEntityType] = useState<string>(ENTITY_TYPES[0]);
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [optionText, setOptionText] = useState('');
  const [required, setRequired] = useState(false);
  const [helpText, setHelpText] = useState('');
  const active = fields.filter((f) => f.active);
  const atLimit = limit !== null && active.length >= limit;
  const needsOptions = type === 'picklist' || type === 'multi_select';

  async function run(action: () => Promise<unknown>, done: string) {
    setFeedback(undefined);
    setBusy(true);
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

  async function create(event: FormEvent) {
    event.preventDefault();
    const labels = optionText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const options = optionsFromLabels(labels);
    const ok = await run(
      () =>
        adminWrite('/config/fields', {
          entityType,
          key: key || keyFromLabel(label),
          label,
          type,
          required,
          ...(helpText.trim() ? { helpText: helpText.trim() } : {}),
          ...(needsOptions ? { options } : {}),
        }),
      `“${label}” added.`,
    );
    if (ok) {
      setLabel('');
      setKey('');
      setOptionText('');
      setHelpText('');
      setRequired(false);
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const ok = await run(
      () =>
        adminWrite(
          `/config/fields/${editing.id}`,
          { label: editing.label, required: editing.required, helpText: editing.helpText?.trim() || null },
          'PATCH',
        ),
      'Field saved.',
    );
    if (ok) setEditing(undefined);
  }

  return (
    <>
      <section className="card" aria-labelledby="fields-title">
        <div className="card-h">
          <h2 className="card-t" id="fields-title">
            Custom fields
          </h2>
          <span className="muted sm">
            {active.length} active{limit !== null ? ` of ${limit} on your plan` : ''}
          </span>
        </div>
        <div className="card-b stack g3">
          <p className="muted">
            Add your own information to each type of record. A field shows on that record’s form once added.
            Deactivating a field hides it but keeps the values already saved.
          </p>
          {fields.length === 0 && <p className="muted">No custom fields yet. Add the first one below.</p>}
          {ENTITY_TYPES.filter((e) => fields.some((f) => f.entityType === e)).map((e) => (
            <div key={e} className={styles.tableWrap}>
              <table className="tbl">
                <caption className={`sm medium ${styles.tableCaption}`}>{ENTITY_LABELS[e]}</caption>
                <thead>
                  <tr>
                    <th scope="col">Label</th>
                    <th scope="col">Type</th>
                    <th scope="col">Required</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fields
                    .filter((f) => f.entityType === e)
                    .map((f) => (
                      <tr key={f.id}>
                        <th scope="row">
                          {f.label} <span className="faint sm">{f.key}</span>
                        </th>
                        <td>{FIELD_TYPE_LABELS[f.type]}</td>
                        <td>{f.required ? 'Yes' : 'No'}</td>
                        <td>{f.active ? 'Active' : 'Deactivated'}</td>
                        <td>
                          {f.active && (
                            <span className="row g2">
                              <Button onClick={() => setEditing({ ...f })} disabled={busy}>
                                Edit
                              </Button>
                              <Button
                                onClick={() =>
                                  run(
                                    () => adminWrite(`/config/fields/${f.id}`, undefined, 'DELETE'),
                                    `“${f.label}” deactivated.`,
                                  )
                                }
                                disabled={busy}
                              >
                                Deactivate
                              </Button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
          <p role="status" className={feedback?.error ? 'field-error' : 'muted'}>
            {feedback?.text}
          </p>
        </div>
      </section>

      {editing && (
        <form className="card" onSubmit={saveEdit} aria-labelledby="edit-title">
          <div className="card-h">
            <h2 className="card-t" id="edit-title">
              Edit “{editing.label}”
            </h2>
          </div>
          <div className="card-b stack g3">
            <Field label="Label" htmlFor="edit-label">
              <TextInput
                id="edit-label"
                value={editing.label}
                maxLength={80}
                required
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              />
            </Field>
            <Field label="Help text" htmlFor="edit-help">
              <TextInput
                id="edit-help"
                value={editing.helpText ?? ''}
                maxLength={300}
                onChange={(e) => setEditing({ ...editing, helpText: e.target.value })}
              />
            </Field>
            <Checkbox
              label="Required"
              checked={editing.required}
              onChange={(e) => setEditing({ ...editing, required: e.target.checked })}
            />
            <div className="row g2">
              <Button variant="primary" type="submit" disabled={busy}>
                Save field
              </Button>
              <Button type="button" onClick={() => setEditing(undefined)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
      )}

      <form className="card" onSubmit={create} aria-labelledby="add-title">
        <div className="card-h">
          <h2 className="card-t" id="add-title">
            Add a field
          </h2>
        </div>
        <div className="card-b stack g3">
          {atLimit && (
            <p className="field-error" role="alert">
              Your plan includes {limit} custom fields. Deactivate one, or ask about upgrading.
            </p>
          )}
          <Field label="Record type" htmlFor="new-entity">
            <select
              className={styles.control}
              id="new-entity"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              {ENTITY_TYPES.map((e) => (
                <option key={e} value={e}>
                  {ENTITY_LABELS[e]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label" htmlFor="new-label">
            <TextInput
              id="new-label"
              value={label}
              maxLength={80}
              required
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label="Key (optional)" htmlFor="new-key">
            <TextInput
              id="new-key"
              value={key}
              maxLength={48}
              placeholder={keyFromLabel(label) || 'made from the label'}
              aria-describedby="new-key-hint"
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
          <p className="faint sm" id="new-key-hint">
            Lowercase letters, numbers and underscores. It can’t be changed later.
          </p>
          <Field label="Type" htmlFor="new-type">
            <select
              className={styles.control}
              id="new-type"
              value={type}
              onChange={(e) => setType(e.target.value as FieldType)}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          {needsOptions && (
            <Field label="Options, one per line" htmlFor="new-options">
              <textarea
                className={styles.control}
                id="new-options"
                rows={4}
                value={optionText}
                onChange={(e) => setOptionText(e.target.value)}
              />
            </Field>
          )}
          <Field label="Help text (optional)" htmlFor="new-help">
            <TextInput id="new-help" value={helpText} maxLength={300} onChange={(e) => setHelpText(e.target.value)} />
          </Field>
          <Checkbox label="Required" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          <div>
            <Button variant="primary" type="submit" disabled={busy || atLimit || !label.trim()}>
              Add field
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
