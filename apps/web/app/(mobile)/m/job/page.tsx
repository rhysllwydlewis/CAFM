'use client';

import { Suspense, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@cafm/ui';
import { ATTACHMENT_MAX_BYTES, PHOTO_MEDIA_TYPES, WORK_ORDER_STATUS_LABELS } from '@cafm/shared';
import { FixSla, PriorityBadge, StatusBadge } from '@/app/(app)/app/work-orders/work-order-parts';
import { ChecklistSteps } from './../checklist-steps';
import { useJob } from './../use-job';

function JobDetail() {
  const id = useSearchParams().get('id') ?? '';
  const { job, queue, status, checklists, queueChange, changeStatus } = useJob(id);
  const [photoError, setPhotoError] = useState('');

  async function addPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!(PHOTO_MEDIA_TYPES as readonly string[]).includes(file.type)) {
      setPhotoError('Choose a JPEG, PNG or WebP photo.');
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setPhotoError('Choose a photo up to 8 MB.');
      return;
    }
    setPhotoError('');
    await queueChange(
      {
        type: 'photo',
        phase: status === 'completed' ? 'after' : 'other',
        caption: null,
        filename: file.name || 'photo.jpg',
        bytes: file.size,
      },
      { file },
    );
  }

  const back = (
    <a
      href="/m"
      className="row"
      style={{
        padding: '4px 14px 0',
        gap: 4,
        fontWeight: 500,
        color: 'var(--primary-text)',
        textDecoration: 'none',
        minHeight: 44,
        alignItems: 'center',
      }}
    >
      <span aria-hidden style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
        <Icon name="chevron-right" size={18} />
      </span>
      My jobs
    </a>
  );

  if (job === undefined) return <>{back}</>;
  if (job === null) {
    return (
      <>
        {back}
        <div className="m-body">
          <div className="m-card">
            <div className="medium">This job is not on your phone</div>
            <div className="sm faint">It may have been closed or given to someone else. Go back and sync.</div>
          </div>
        </div>
      </>
    );
  }

  const photos = queue.filter((record) => record.change.type === 'photo' && record.state === 'pending').length;
  const waiting = queue.filter((record) => record.state === 'pending').length;
  const failed = queue.filter((record) => record.state === 'failed').length;
  const next =
    status === 'on_site'
      ? null
      : status && ['assigned', 'accepted', 'travelling', 'paused'].includes(status)
        ? 'on_site'
        : null;
  return (
    <>
      {back}
      <div className="m-head">
        <div className="xs faint medium">
          {job.number} · <PriorityBadge priority={job.priority} />
        </div>
        <h1 className="m-title" style={{ margin: 0 }}>
          {job.title}
        </h1>
      </div>
      <div className="m-body" style={{ overflow: 'visible' }}>
        <div className="row" style={{ gap: 8 }}>
          <StatusBadge item={status && status !== job.status ? { ...job, status } : job} />
          <FixSla item={job} now={Date.now()} />
        </div>
        {(waiting > 0 || failed > 0) && (
          <a
            href="/m/sync"
            className="m-card"
            style={{
              textDecoration: 'none',
              color: 'inherit',
              background: 'var(--warning-soft)',
              borderColor: 'transparent',
            }}
          >
            <span className="sm medium">
              {waiting > 0 ? waiting + (waiting === 1 ? ' change' : ' changes') + ' waiting to sync' : ''}
              {waiting > 0 && failed > 0 ? ' · ' : ''}
              {failed > 0 ? failed + (failed === 1 ? ' change was' : ' changes were') + ' refused' : ''}
            </span>
          </a>
        )}
        <div className="m-card">
          <div className="row" style={{ gap: 10 }}>
            <Icon name="location" size={18} />
            <div>
              <div className="medium sm">{job.location.name}</div>
              {job.accessNotes && <div className="xs faint">{job.accessNotes}</div>}
            </div>
          </div>
          {job.asset && (
            <div className="row" style={{ gap: 10 }}>
              <Icon name="asset" size={18} />
              <div>
                <div className="medium sm">
                  {job.asset.name} · {job.asset.number}
                </div>
                {job.assetDetail && (
                  <div className="xs faint">
                    {[job.assetDetail.make, job.assetDetail.model, job.assetDetail.serial].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {job.description && (
          <div className="m-card">
            <div className="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {job.description}
            </div>
          </div>
        )}
        {checklists.length === 0 ? (
          <div className="m-card">
            <div className="medium sm">Checklists</div>
            <div className="xs faint">No checklist on this job.</div>
          </div>
        ) : (
          <ChecklistSteps
            checklists={checklists}
            onAnswer={(list, item, answer, note) =>
              queueChange({
                type: 'mutation',
                item: {
                  key: '',
                  kind: 'checklist_answer',
                  workOrderId: job.id,
                  checklistId: list.id,
                  itemId: item.id,
                  payload: { answer, note },
                },
              })
            }
          />
        )}
        <div className="m-card">
          <div className="medium sm">Photos</div>
          <div className="xs faint">
            {photos === 0
              ? 'Photos are saved on this phone and sent when you have signal.'
              : photos + ' waiting to sync.'}
          </div>
          <label className="m-btn secondary" style={{ cursor: 'pointer' }}>
            <Icon name="camera" size={18} />
            Add a photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={addPhoto}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
            />
          </label>
          {photoError && (
            <div className="sm" role="alert" style={{ color: 'var(--danger-text)' }}>
              {photoError}
            </div>
          )}
        </div>
        {next && (
          <button type="button" className="m-btn secondary" onClick={() => void changeStatus(next)}>
            Start work ({WORK_ORDER_STATUS_LABELS[next]})
          </button>
        )}
        {status === 'on_site' && (
          <a href={'/m/job/complete?id=' + job.id} className="m-btn primary" style={{ textDecoration: 'none' }}>
            Complete job
          </a>
        )}
      </div>
    </>
  );
}

export default function JobPage() {
  return (
    <Suspense>
      <JobDetail />
    </Suspense>
  );
}
