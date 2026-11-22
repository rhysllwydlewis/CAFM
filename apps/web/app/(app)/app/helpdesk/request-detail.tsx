import { Fragment } from 'react';
import Link from 'next/link';
import { Icon } from '@cafm/ui';
import { REQUEST_CHANNEL_LABELS, REQUEST_STATUS_LABELS, type RequestRecord } from '@cafm/shared';
import { requestTime } from '@/lib/helpdesk-format';
import { RequestStatus } from './request-table';
import { RequestActions } from './request-actions';
import styles from './helpdesk.module.css';

export function RequestDetail({
  record,
  own,
  canManage,
  duplicates,
}: {
  record: RequestRecord;
  own: boolean;
  canManage: boolean;
  duplicates?: { id: string; number: string; title: string; version: number }[];
}) {
  return (
    <div className={(own ? styles.portalContent : 'page') + ' stack g4'}>
      <div className="page-head">
        <div className="stack g2">
          <Link href={own ? '/portal#my-requests' : '/app/helpdesk'}>{own ? 'My requests' : 'Helpdesk queue'}</Link>
          <div className="row wrap g2">
            <span className="ref">{record.number}</span>
            <RequestStatus item={record} />
          </div>
          <h1 className="page-title">{record.title}</h1>
        </div>
      </div>
      <div className={styles.columns}>
        <section className="card card-b stack g3">
          <h2 className="card-t">Request details</h2>
          <p className={styles.bodyText}>{record.description}</p>
          <div className="row wrap g2 muted">
            <Icon name="location" />
            {record.location.name} · {record.location.code}
          </div>
          {record.asset && (
            <div className="row wrap g2">
              <Icon name="asset" />
              {record.asset.name} · {record.asset.number}
            </div>
          )}
          <dl className="kv">
            <dt>Category</dt>
            <dd>
              {record.type.category} › {record.type.problemCode}
            </dd>
            <dt>Reported</dt>
            <dd>
              {requestTime(record.createdAt)} · {REQUEST_CHANNEL_LABELS[record.channel]}
            </dd>
            {!own && (
              <>
                <dt>Requester</dt>
                <dd>{record.requesterName ?? 'Email requester'}</dd>
                <dt>Assignee</dt>
                <dd>{record.assigneeName ?? 'Unassigned'}</dd>
                <dt>Priority</dt>
                <dd>P{record.priority}</dd>
                {record.answers.map(({ label, value }, index) => (
                  <Fragment key={index}>
                    <dt>{label}</dt>
                    <dd>{value ? 'Yes' : 'No'}</dd>
                  </Fragment>
                ))}
                {record.responseDueAt && (
                  <>
                    <dt>Response due</dt>
                    <dd>{requestTime(record.responseDueAt)}</dd>
                  </>
                )}
                {record.attendDueAt && (
                  <>
                    <dt>Attendance due</dt>
                    <dd>{requestTime(record.attendDueAt)}</dd>
                  </>
                )}
                {record.fixDueAt && (
                  <>
                    <dt>Fix due</dt>
                    <dd>{requestTime(record.fixDueAt)}</dd>
                  </>
                )}
              </>
            )}
          </dl>
        </section>
        <section className="card card-b stack g3">
          <h2 className="card-t">Activity</h2>
          <ol className={styles.timeline}>
            {record.entries.map((entry) => (
              <li key={entry.id} className="stack g2">
                <div className="row wrap between g2">
                  <strong>{entry.kind === 'comment' ? (entry.author ?? 'Email requester') : 'Request update'}</strong>
                  <time className="muted sm" dateTime={entry.createdAt}>
                    {requestTime(entry.createdAt)}
                  </time>
                </div>
                {entry.internal && <span className="badge outline">Internal note</span>}
                <p className={styles.bodyText}>{entry.body}</p>
              </li>
            ))}
          </ol>
          {record.rating !== null && (
            <div className="card card-b stack g2">
              <strong>Rated {record.rating} out of 5</strong>
              {record.feedback && <p className={styles.bodyText}>{record.feedback}</p>}
            </div>
          )}
          {own || canManage ? (
            <RequestActions key={record.version} record={record} own={own} duplicates={duplicates} />
          ) : null}
        </section>
      </div>
      <span className="sr-only">{REQUEST_STATUS_LABELS[record.status]}</span>
    </div>
  );
}
