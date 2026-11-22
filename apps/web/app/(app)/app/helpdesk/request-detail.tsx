import { Fragment } from 'react';
import Link from 'next/link';
import type { FieldDefinition } from '@cafm/config-engine';
import { customFieldValue } from '../locations/location-custom-fields';
import { Icon } from '@cafm/ui';
import {
  acceptsRequestComments,
  REQUEST_CHANNEL_LABELS,
  type RequestRecord,
  type RequestTypeChoice,
  type WorkOrderSummary,
} from '@cafm/shared';
import { AttachmentPanel } from '@/components/attachment-panel';
import { attachmentList } from '@/lib/attachments';
import { requestTime } from '@/lib/helpdesk-format';
import { RequestWorkOrders } from '../work-orders/convert-request';
import { RequestStatus } from './request-table';
import { RequestActions } from './request-actions';
import styles from './helpdesk.module.css';

export async function RequestDetail({
  record,
  own,
  canManage,
  duplicates,
  triageTypes,
  workOrders,
}: {
  record: RequestRecord<FieldDefinition>;
  /** Set when the person can see work orders. */
  workOrders?: { jobs: WorkOrderSummary[]; canConvert: boolean; canAssign: boolean };
  triageTypes?: RequestTypeChoice[];
  own: boolean;
  canManage: boolean;
  duplicates?: { id: string; number: string; title: string; version: number }[];
}) {
  const filePath = (own ? '/helpdesk/mine/' : '/helpdesk/requests/') + record.id + '/attachments';
  const files = await attachmentList(filePath);
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
        <div className="stack g3">
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
              {record.customFields.map(({ definition, value }) => (
                <Fragment key={definition.key}>
                  <dt>{definition.label}</dt>
                  <dd>{customFieldValue(definition, value)}</dd>
                </Fragment>
              ))}
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
          {workOrders && !own && (
            <RequestWorkOrders
              key={record.version}
              requestId={record.id}
              requestVersion={record.version}
              requestTitle={record.title}
              locationId={record.location.id}
              jobs={workOrders.jobs}
              canConvert={workOrders.canConvert && ['new', 'assigned', 'in_progress'].includes(record.status)}
              canAssign={workOrders.canAssign}
            />
          )}
          <AttachmentPanel
            path={filePath}
            items={files}
            photos
            linkedPhotoReports={own ? undefined : record.linkedPhotoReports}
            canUpload={own && acceptsRequestComments(record.status)}
          />
        </div>
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
            <RequestActions
              key={record.version}
              record={record}
              own={own}
              duplicates={duplicates}
              triageTypes={triageTypes}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
