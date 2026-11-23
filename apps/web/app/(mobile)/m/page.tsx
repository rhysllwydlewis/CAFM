'use client';

import { Icon } from '@cafm/ui';
import { FixSla, PriorityBadge, StatusBadge } from '@/app/(app)/app/work-orders/work-order-parts';
import { syncedText, useJobs } from './use-jobs';

export default function MyJobsPage() {
  const { jobs, syncedAt, result, busy, sync } = useJobs();
  const now = Date.now();
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <>
      <div className="m-head">
        <div className="xs faint medium">
          {today}
          {jobs ? ' · ' + jobs.length + (jobs.length === 1 ? ' job' : ' jobs') : ''}
        </div>
        <h1 className="m-title" style={{ margin: 0 }}>
          My jobs
        </h1>
      </div>
      <div className="m-body" style={{ overflow: 'visible' }}>
        {jobs && jobs.length === 0 && (
          <div className="m-card">
            <div className="medium">No jobs for you right now</div>
            <div className="sm faint">New jobs appear here when you have signal.</div>
          </div>
        )}
        {jobs?.map((job) => (
          <a
            key={job.id}
            href={'/m/job?id=' + job.id}
            className="m-card"
            style={{ textDecoration: 'none', color: 'inherit', minHeight: 44 }}
          >
            <div className="row between">
              <span className="mono xs faint">{job.number}</span>
              <PriorityBadge priority={job.priority} />
            </div>
            <div className="medium" style={{ fontSize: 17 }}>
              {job.title}
            </div>
            <div className="sm faint row" style={{ gap: 6 }}>
              <Icon name="location" size={14} />
              {job.location.name}
            </div>
            <div className="row between">
              <FixSla item={job} now={now} />
              <StatusBadge item={job} />
            </div>
          </a>
        ))}
        <div className="row xs faint" style={{ justifyContent: 'center', gap: 8, paddingTop: 4 }}>
          <Icon name={result === 'offline' ? 'offline' : 'synced'} size={14} />
          <span role="status">{syncedText(syncedAt, result)}</span>
          <button type="button" className="btn ghost sm" onClick={sync} aria-disabled={busy} disabled={busy}>
            Sync now
          </button>
        </div>
      </div>
    </>
  );
}
