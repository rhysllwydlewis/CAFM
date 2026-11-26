'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, Icon, TextInput } from '@fmstead/ui';
import type { FieldDefinition } from '@fmstead/config-engine';
import {
  ATTACHMENT_MAX_BYTES,
  PHOTO_MEDIA_TYPES,
  type ReportAsset,
  type ReportLocation,
  type RequestCatalogue,
  type RequestSummary,
} from '@fmstead/shared';
import { uploadFile } from '@/lib/attachment-client';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { LocationCustomFields, readCustomFields } from '../locations/location-custom-fields';
import styles from './helpdesk.module.css';
import { RecordPicker } from './record-picker';

type Selected = { id: string; name: string; code?: string; number?: string };

export function RequestForm({
  data,
  staff = false,
  scanned,
  scannedAsset,
  draftId,
  fromRegister = false,
  fromAssetTag = false,
  returnTo = '/app/helpdesk',
}: {
  data: RequestCatalogue<FieldDefinition>;
  staff?: boolean;
  scanned?: ReportLocation;
  scannedAsset?: ReportAsset;
  draftId?: string;
  fromRegister?: boolean;
  fromAssetTag?: boolean;
  returnTo?: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const submission = useRef<string>(null);
  const descriptionField = useRef<HTMLTextAreaElement>(null);
  const [type, setType] = useState('');
  const [location, setLocation] = useState<Selected | null>(scanned ?? null);
  const [asset, setAsset] = useState<Selected | null>(scannedAsset ?? null);
  const [requester, setRequester] = useState<Selected | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');

  useEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    const opener = document.activeElement;
    modal.showModal();
    return () => {
      modal.close();
      if (opener instanceof HTMLElement && opener !== document.body) opener.focus();
      else document.getElementById('quick-log-trigger')?.focus();
    };
  }, []);

  useEffect(() => {
    const field = descriptionField.current;
    if (!draftId || !field || field.value) return;
    try {
      field.value = sessionStorage.getItem('fmstead-request-' + draftId) ?? '';
      sessionStorage.removeItem('fmstead-request-' + draftId);
    } catch {
      // The form is still usable when storage is disabled.
    }
  }, [draftId]);

  const active = data.types.find(({ id }) => id === type);
  const cancel = staff ? returnTo : '/portal';
  function closeDialog() {
    dialog.current?.close();
    router.push(cancel);
  }
  const categories = [...new Set(data.types.map(({ category }) => category))];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!location || !active) {
      setError('Choose a location and request type.');
      return;
    }
    const values = new FormData(event.currentTarget);
    const file = values.get('photo');
    const photo = file instanceof File && file.size ? file : null;
    if (
      photo &&
      (photo.size > ATTACHMENT_MAX_BYTES || (photo.type && !PHOTO_MEDIA_TYPES.some((type) => type === photo.type)))
    ) {
      setError('Choose a JPEG, PNG or WebP photo up to 8 MB.');
      return;
    }
    const description = String(values.get('description') ?? '').trim();
    const title =
      String(values.get('title') ?? '').trim() || description.split(/\r?\n/)[0]?.slice(0, 160) || active.name;
    setBusy(true);
    try {
      submission.current ??= crypto.randomUUID();
      const saved = await helpdeskWrite<RequestSummary>('/helpdesk/requests', {
        submissionId: submission.current,
        title,
        description,
        locationId: location.id,
        assetId: asset?.id ?? null,
        typeId: active.id,
        channel: staff ? 'phone' : scanned && !fromRegister ? 'qr' : 'portal',
        ...(requester ? { requesterId: requester.id } : {}),
        answers: Object.fromEntries(
          active.questions.flatMap(({ key }) => {
            const value = values.get('triage-' + key);
            return value ? [[key, value === 'yes']] : [];
          }),
        ),
        custom: readCustomFields(data.customFields, values),
      });
      if (photo) {
        try {
          await uploadFile('/helpdesk/mine/' + saved.id + '/attachments', photo, true);
        } catch (error) {
          setSavedId(saved.id);
          setError(error instanceof Error ? error.message : 'Could not upload the photo.');
          setBusy(false);
          return;
        }
      }
      router.replace((staff ? '/app/helpdesk/' : '/portal/requests/') + saved.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send this request.');
      setBusy(false);
    }
  }

  const content = data.types.length ? (
    <form className="stack g4" onSubmit={submit}>
      <div className={staff ? styles.columns : 'stack g4'}>
        <div className="stack g4">
          {staff && (
            <RecordPicker label="Requester" path="/helpdesk/contacts" value={requester} onChange={setRequester} />
          )}
          {scanned ? (
            <div className="card card-b row g3">
              <Icon name="location" size={20} />
              <div>
                <strong>{scanned.name}</strong>
                <div className="muted">
                  {scanned.code}
                  {fromRegister ? '' : fromAssetTag ? ' · From asset tag' : ' · From QR code'}
                </div>
                {scannedAsset && (
                  <div>
                    {scannedAsset.name} · {scannedAsset.number}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <RecordPicker
              label="Location"
              path="/helpdesk/locations"
              value={location}
              required
              onChange={(selected) => {
                setLocation(selected);
                setAsset(null);
              }}
            />
          )}
          {location && !scannedAsset && (
            <RecordPicker
              key={location.id}
              label="Asset (optional)"
              path={'/helpdesk/locations/' + location.id + '/assets'}
              value={asset}
              onChange={setAsset}
            />
          )}
          {staff && (
            <Field label="Summary" htmlFor="request-title">
              <TextInput id="request-title" name="title" maxLength={160} />
            </Field>
          )}
          <Field label="Description" htmlFor="request-description">
            <textarea
              id="request-description"
              className={styles.textarea}
              name="description"
              required
              maxLength={6000}
              ref={descriptionField}
            />
          </Field>
        </div>
        <div className="stack g4">
          {staff ? (
            <Field label="Request type" htmlFor="request-type">
              <select
                id="request-type"
                className={styles.control}
                value={type}
                required
                onChange={(event) => setType(event.target.value)}
              >
                <option value="">Choose a request type</option>
                {categories.map((category) => (
                  <optgroup label={category} key={category}>
                    {data.types
                      .filter((item) => item.category === category)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </Field>
          ) : (
            <fieldset>
              <legend>What’s the problem?</legend>
              <div className={styles.options}>
                {data.types.map((item) => (
                  <label key={item.id} className={styles.option}>
                    <input
                      name="request-type"
                      type="radio"
                      required
                      value={item.id}
                      checked={type === item.id}
                      onChange={() => setType(item.id)}
                    />
                    {item.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {active?.questions.map((question) => (
            <Field key={active.id + question.key} label={question.label} htmlFor={'triage-' + question.key}>
              <select
                className={styles.control}
                id={'triage-' + question.key}
                name={'triage-' + question.key}
                required={question.required}
              >
                <option value="">Choose an answer</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
          ))}
        </div>
      </div>
      <LocationCustomFields fields={data.customFields} />
      {!staff && (
        <Field label="Photo (optional)" htmlFor="request-photo">
          <small className="muted" id="request-photo-hint">
            JPEG, PNG or WebP, up to 8 MB.
          </small>
          <input
            id="request-photo"
            aria-describedby="request-photo-hint"
            name="photo"
            type="file"
            accept={PHOTO_MEDIA_TYPES.join(',')}
          />
        </Field>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Sending…' : staff ? 'Save request' : 'Send report'}
        </Button>
        <Link href={cancel} className="btn">
          Cancel
        </Link>
      </div>
    </form>
  ) : (
    <p className="muted">Ask your organisation’s administrator to add a request type.</p>
  );

  if (savedId)
    return (
      <div className="stack g3">
        <p role="status">
          <strong>Report sent.</strong> {error}
        </p>
        <div>
          <Link className="btn primary" href={'/portal/requests/' + savedId}>
            Open request and retry photo
          </Link>
        </div>
      </div>
    );
  if (!staff) return content;
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="quick-log-title"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeDialog();
        }
      }}
    >
      <div className="card-b stack g4">
        <div className="row between g3">
          <h2 id="quick-log-title" className="card-t">
            Log a request
          </h2>
          <Link href={cancel} className="btn">
            Close
          </Link>
        </div>
        {content}
      </div>
    </dialog>
  );
}
