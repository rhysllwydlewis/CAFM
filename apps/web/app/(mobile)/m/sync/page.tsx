'use client';

import { describeOutboxEntry } from '@fmstead/shared';
import { Icon } from '@fmstead/ui';
import { removeFromOutbox, retryOutboxEntry } from '@/lib/mobile-store';
import { syncedText, useJobs } from '../use-jobs';
import { useOutbox } from '../use-outbox';

export default function SyncPage() {
  const { jobs, syncedAt, result, busy, sync, reload } = useJobs();
  const { records, reload: reloadOutbox } = useOutbox();
  const refresh = async () => {
    await sync();
    await reload();
    await reloadOutbox();
  };
  const pending = records?.filter((record) => record.state === 'pending') ?? [];
  const failed = records?.filter((record) => record.state === 'failed') ?? [];
  const number = (workOrderId: string) => jobs?.find((job) => job.id === workOrderId)?.number ?? 'Job';
  const offline = result === 'offline';

  return (
    <>
      <div className="m-head">
        <div className="xs faint medium">{syncedText(syncedAt, result)}</div>
        <h1 className="m-title" style={{ margin: 0 }}>
          Sync
        </h1>
      </div>
      <div className="m-body" style={{ overflow: 'visible' }}>
        {offline && (
          <div
            className="m-card"
            role="status"
            style={{ background: 'var(--warning-soft)', borderColor: 'transparent' }}
          >
            <span className="row" style={{ gap: 10 }}>
              <Icon name="offline" size={20} />
              <span className="medium sm">No signal. Keep working. Changes will sync automatically.</span>
            </span>
          </div>
        )}
        <div className="m-card">
          <div className="medium sm">Waiting to sync ({pending.length})</div>
          {pending.length === 0 && <div className="sm faint">Nothing is waiting.</div>}
          {pending.map((record) => (
            <div key={record.id} className="row between sm" style={{ padding: '3px 0', gap: 8 }}>
              <span className="row" style={{ gap: 6 }}>
                <Icon name="clock" size={14} />
                {describeOutboxEntry(record)}
              </span>
              <span className="xs faint">{number(record.workOrderId)}</span>
            </div>
          ))}
        </div>
        {failed.length > 0 && (
          <div className="m-card" role="alert" style={{ borderColor: 'var(--danger)' }}>
            <div className="medium sm">The server did not accept ({failed.length})</div>
            {failed.map((record) => (
              <div key={record.id} className="stack" style={{ gap: 6, padding: '4px 0' }}>
                <div className="row between sm">
                  <span>{describeOutboxEntry(record)}</span>
                  <span className="xs faint">{number(record.workOrderId)}</span>
                </div>
                <div className="xs">{record.message}</div>
                <div className="grid g-2" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="m-btn secondary"
                    style={{ height: 44 }}
                    onClick={async () => {
                      await retryOutboxEntry(record);
                      await refresh();
                    }}
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    className="m-btn secondary"
                    style={{ height: 44 }}
                    onClick={async () => {
                      await removeFromOutbox(record.id);
                      await reloadOutbox();
                    }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="m-card">
          <div className="medium sm">Downloaded for offline use</div>
          <div className="xs faint">
            {jobs ? jobs.length + (jobs.length === 1 ? ' job' : ' jobs') : 'Loading'}
            {' · '}
            {jobs ? jobs.reduce((sum, job) => sum + job.checklists.length, 0) : 0} checklists
          </div>
        </div>
        <button
          type="button"
          className="m-btn secondary"
          onClick={() => void refresh()}
          disabled={busy}
          aria-busy={busy}
        >
          <Icon name="refresh" size={18} />
          Try sync now
        </button>
      </div>
    </>
  );
}
