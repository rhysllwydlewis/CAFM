'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@cafm/ui';
import type { MobilePackJob } from '@cafm/shared';
import { FixSla, PriorityBadge, StatusBadge } from '@/app/(app)/app/work-orders/work-order-parts';
import { readJob } from '@/lib/mobile-store';

function JobDetail() {
  const id = useSearchParams().get('id') ?? '';
  const [job, setJob] = useState<MobilePackJob | null | undefined>(undefined);
  useEffect(() => {
    void readJob(id).then(setJob);
  }, [id]);

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

  const checklistCount = job.checklists.length;
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
          <StatusBadge item={job} />
          <FixSla item={job} now={Date.now()} />
        </div>
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
        <div className="m-card">
          <div className="medium sm">Checklists</div>
          <div className="xs faint">
            {checklistCount === 0
              ? 'No checklist on this job.'
              : checklistCount + (checklistCount === 1 ? ' checklist is' : ' checklists are') + ' saved on this phone.'}
          </div>
        </div>
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
