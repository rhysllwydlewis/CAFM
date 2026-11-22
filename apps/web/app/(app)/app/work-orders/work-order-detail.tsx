import { Fragment } from 'react';
import Link from 'next/link';
import type { FieldDefinition } from '@cafm/config-engine';
import { Icon } from '@cafm/ui';
import type { WorkOrderRecord } from '@cafm/shared';
import { requestTime } from '@/lib/helpdesk-format';
import { customFieldValue } from '../locations/location-custom-fields';
import { WorkOrderActions } from './work-order-actions';
import { PriorityBadge, StatusBadge } from './work-order-parts';
import styles from './work-orders.module.css';

const when = (value: string | null) => (value ? requestTime(value) : null);

export function WorkOrderDetail({
  record,
  canEdit,
  canAssign,
  canNote,
  showRequest,
}: {
  record: WorkOrderRecord<FieldDefinition>;
  canEdit: boolean;
  canAssign: boolean;
  canNote: boolean;
  showRequest: boolean;
}) {
  const times: [string, string | null][] = [
    ['Response due', when(record.responseDueAt)],
    ['Attendance due', when(record.attendDueAt)],
    ['Fix due', when(record.fixDueAt)],
    ['First response', when(record.firstResponseAt)],
    ['On site', when(record.attendedAt)],
    ['Completed', when(record.completedAt)],
    ['Verified', when(record.verifiedAt)],
    ['Closed', when(record.closedAt)],
  ];
  return (
    <div className="page stack g4">
      <div className="page-head">
        <div className="stack g2">
          <Link href="/app/work-orders">Work orders</Link>
          <div className="row wrap g2">
            <span className="ref">{record.number}</span>
            <StatusBadge item={record} />
            <PriorityBadge priority={record.priority} />
          </div>
          <h1 className="page-title">{record.title}</h1>
        </div>
      </div>
      <div className={styles.columns}>
        <section className="card card-b stack g3">
          <h2 className="card-t">Details</h2>
          <p className={styles.bodyText}>{record.description}</p>
          <div className="row wrap g2 muted">
            <Icon name="location" />
            {record.location.name} · {record.location.code}
          </div>
          {record.asset && (
            <div className="row wrap g2">
              <Icon name="asset" />
              <Link href={'/app/assets/' + record.asset.id}>
                {record.asset.name} · {record.asset.number}
              </Link>
            </div>
          )}
          <dl className="kv">
            <dt>Assigned to</dt>
            <dd>{record.assigneeName ?? 'Unassigned'}</dd>
            {record.request && (
              <>
                <dt>Raised from</dt>
                <dd>
                  {showRequest ? (
                    <Link href={'/app/helpdesk/' + record.request.id}>{record.request.number}</Link>
                  ) : (
                    record.request.number
                  )}
                </dd>
              </>
            )}
            <dt>Raised by</dt>
            <dd>{record.createdByName ?? '—'}</dd>
            <dt>Raised</dt>
            <dd>{requestTime(record.createdAt)}</dd>
            {times.map(([label, value]) =>
              value ? (
                <Fragment key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </Fragment>
              ) : null,
            )}
            {record.customFields.map(({ definition, value }) => (
              <Fragment key={definition.key}>
                <dt>{definition.label}</dt>
                <dd>{customFieldValue(definition, value)}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
        <section className="card card-b stack g3">
          <h2 className="card-t">Activity</h2>
          <ol className={styles.timeline}>
            {record.entries.map((entry) => (
              <li key={entry.id} className="stack g2">
                <div className="row wrap between g2">
                  <strong>{entry.author ?? 'CAFM'}</strong>
                  <time className="muted sm" dateTime={entry.createdAt}>
                    {requestTime(entry.createdAt)}
                  </time>
                </div>
                {entry.internal && <span className="badge outline">Internal note</span>}
                <p className={styles.bodyText}>{entry.body}</p>
              </li>
            ))}
          </ol>
          <WorkOrderActions
            key={record.version + ':' + record.entries.length}
            record={record}
            canEdit={canEdit}
            canAssign={canAssign}
            canNote={canNote}
          />
        </section>
      </div>
    </div>
  );
}
