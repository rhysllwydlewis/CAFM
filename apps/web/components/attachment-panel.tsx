'use client';

import { type FormEvent, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@cafm/ui';
import { ASSET_ATTACHMENT_MEDIA_TYPES, ATTACHMENT_LIMIT, PHOTO_MEDIA_TYPES, type AttachmentItem } from '@cafm/shared';
import { uploadFile } from '@/lib/attachment-client';

export function AttachmentPanel({
  path,
  items,
  photos,
  canUpload,
}: {
  path: string;
  items: AttachmentItem[];
  photos?: boolean;
  canUpload: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get('file');
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await uploadFile(path, file, !!photos);
      form.reset();
      setStatus(photos ? 'Photo added.' : 'File added.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack g3" aria-labelledby={id + '-title'} id={photos ? undefined : 'documents'}>
      <header className="card-h">
        <h2 className="card-t" id={id + '-title'}>
          {photos ? 'Photos' : 'Documents'}
        </h2>
      </header>
      <div className="card-b stack g3">
        {items.length ? (
          <ul className="stack g2">
            {items.map((file) => (
              <li key={file.id} className="row wrap between g2">
                <a className="link" style={{ overflowWrap: 'anywhere' }} href={'/api' + path + '/' + file.id} download>
                  {file.filename}
                </a>
                <span className="muted sm">
                  {Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(file.byteLength / 1024)} KB
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{photos ? 'No photos attached.' : 'No documents attached.'}</p>
        )}
        {canUpload && items.length < ATTACHMENT_LIMIT && (
          <form onSubmit={upload} className="stack g2">
            <Field label={photos ? 'Choose a photo' : 'Choose a file'} htmlFor={id}>
              <small className="muted" id={id + '-hint'}>
                {photos ? 'JPEG, PNG or WebP, up to 8 MB.' : 'JPEG, PNG, WebP or PDF, up to 8 MB.'}
              </small>
              <input
                id={id}
                aria-describedby={id + '-hint'}
                name="file"
                type="file"
                disabled={busy}
                accept={(photos ? PHOTO_MEDIA_TYPES : ASSET_ATTACHMENT_MEDIA_TYPES).join(',')}
                required
              />
            </Field>
            <div>
              <Button type="submit" icon="upload" disabled={busy}>
                {busy ? 'Uploading…' : photos ? 'Upload photo' : 'Upload file'}
              </Button>
            </div>
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            {status && <p role="status">{status}</p>}
          </form>
        )}
      </div>
    </section>
  );
}
