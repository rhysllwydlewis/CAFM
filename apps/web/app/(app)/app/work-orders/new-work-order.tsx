'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@fmstead/ui';
import type { WorkOrderSummary } from '@fmstead/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { RecordPicker } from '../helpdesk/record-picker';
import styles from './work-orders.module.css';

type Selected = { id: string; name: string; code?: string; number?: string };
const LEVELS = [
  ['1', 'High'],
  ['2', 'Medium'],
  ['3', 'Low'],
];

export function NewWorkOrder({ canAssign, returnTo }: { canAssign: boolean; returnTo: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const submission = useRef<string | null>(null);
  const [location, setLocation] = useState<Selected | null>(null);
  const [asset, setAsset] = useState<Selected | null>(null);
  const [assignee, setAssignee] = useState<Selected | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    modal.showModal();
    return () => {
      modal.close();
      document.getElementById('new-work-order-trigger')?.focus();
    };
  }, []);

  function close() {
    dialog.current?.close();
    router.push(returnTo);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!location) {
      setError('Choose a location.');
      return;
    }
    const values = new FormData(event.currentTarget);
    setBusy(true);
    try {
      submission.current ??= crypto.randomUUID();
      const saved = await helpdeskWrite<WorkOrderSummary>('/work-orders', {
        submissionId: submission.current,
        title: String(values.get('title') ?? '').trim(),
        description: String(values.get('description') ?? '').trim(),
        locationId: location.id,
        assetId: asset?.id ?? null,
        impact: Number(values.get('impact')),
        urgency: Number(values.get('urgency')),
        assigneeId: assignee?.id ?? null,
      });
      router.replace('/app/work-orders/' + saved.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this work order.');
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="new-work-order-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="card-b stack g4">
        <div className="row between g3">
          <h2 id="new-work-order-title" className="card-t">
            New work order
          </h2>
          <Link href={returnTo} className="btn">
            Close
          </Link>
        </div>
        <form className="stack g4" onSubmit={submit}>
          <div className={styles.columns}>
            <div className="stack g4">
              <RecordPicker
                label="Location"
                path="/work-orders/locations"
                value={location}
                required
                onChange={(selected) => {
                  setLocation(selected);
                  setAsset(null);
                  setAssignee(null);
                }}
              />
              {location && (
                <RecordPicker
                  key={'asset-' + location.id}
                  label="Asset (optional)"
                  path={'/work-orders/locations/' + location.id + '/assets'}
                  value={asset}
                  onChange={setAsset}
                />
              )}
              {location && canAssign && (
                <RecordPicker
                  key={'assignee-' + location.id}
                  label="Assignee (optional)"
                  path={'/work-orders/locations/' + location.id + '/assignees'}
                  value={assignee}
                  onChange={setAssignee}
                />
              )}
            </div>
            <div className="stack g4">
              <Field label="Title" htmlFor="new-wo-title">
                <TextInput id="new-wo-title" name="title" required maxLength={160} />
              </Field>
              <Field label="Description" htmlFor="new-wo-description">
                <textarea
                  id="new-wo-description"
                  name="description"
                  className={styles.textarea}
                  required
                  maxLength={6000}
                />
              </Field>
              {(['impact', 'urgency'] as const).map((key) => (
                <Field key={key} label={key === 'impact' ? 'Impact' : 'Urgency'} htmlFor={'new-wo-' + key}>
                  <select id={'new-wo-' + key} name={key} className={styles.control} defaultValue="2">
                    {LEVELS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
          </div>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Create work order'}
            </Button>
            <Link href={returnTo} className="btn">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </dialog>
  );
}
