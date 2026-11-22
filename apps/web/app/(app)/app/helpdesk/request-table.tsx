'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { REQUEST_CHANNEL_LABELS, REQUEST_STATUS_LABELS, type RequestSummary } from '@cafm/shared';
import { Icon } from '@cafm/ui';
import styles from './helpdesk.module.css';

import { requestTime } from '@/lib/helpdesk-format';

export function RequestStatus({ item }: { item: Pick<RequestSummary, 'status' | 'linkedStatus'> }) {
  const status = item.linkedStatus ?? item.status;
  const tone = ['completed', 'closed'].includes(status) ? 'success' : status === 'rejected' ? 'danger' : 'primary';
  return (
    <span className={'badge ' + tone}>
      {item.linkedStatus ? 'Linked · ' + REQUEST_STATUS_LABELS[item.linkedStatus] : REQUEST_STATUS_LABELS[item.status]}
    </span>
  );
}

function Sla({ item, now }: { item: RequestSummary; now: number }) {
  if (item.firstResponseAt) return <span>Responded</span>;
  if (!item.responseDueAt || ['completed', 'closed', 'rejected', 'merged'].includes(item.status)) return <span>—</span>;
  const remaining = new Date(item.responseDueAt).getTime() - now;
  const minutes = Math.ceil(Math.abs(remaining) / 60_000);
  const duration = minutes < 60 ? minutes + ' min' : Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
  const label = remaining < 0 ? 'Breached by ' : minutes <= 60 ? 'At risk · ' : '';
  const tone = remaining < 0 ? 'danger' : minutes <= 60 ? 'warning' : '';
  return (
    <span className={'badge ' + tone} title={requestTime(item.responseDueAt)}>
      <Icon name="sla" size={14} />
      {label}
      {duration}
    </span>
  );
}

export function RequestTable({ items, now, own = false }: { items: RequestSummary[]; now: number; own?: boolean }) {
  const [clock, setClock] = useState(now);
  useEffect(() => {
    if (own) return;
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [own, now]);
  if (!items.length)
    return (
      <div className="empty">
        <Icon name="helpdesk" size={24} />
        <p>{own ? 'Your reports will appear here.' : 'No requests match this view.'}</p>
      </div>
    );
  const route = own ? '/portal/requests/' : '/app/helpdesk/';
  if (own)
    return (
      <ul className={styles.timeline}>
        {items.map((item) => (
          <li key={item.id}>
            <div className="row wrap between g2">
              <Link className="medium" href={route + item.id}>
                {item.title}
              </Link>
              <RequestStatus item={item} />
            </div>
            <p className="sm muted">
              {item.number} · {item.location.name} · Updated {requestTime(item.updatedAt)}
            </p>
          </li>
        ))}
      </ul>
    );
  return (
    <div className={styles.tableWrap} role="region" aria-label="Request results" tabIndex={0}>
      <table className="tbl">
        <thead>
          <tr>
            {['Ref', 'Request', 'Category', 'Priority', 'SLA (response)', 'Status', 'Requester', 'Channel'].map(
              (label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <Link className="ref" href={route + item.id}>
                  {item.number}
                </Link>
              </td>
              <td>
                <Link className="medium" href={route + item.id}>
                  {item.title}
                </Link>
                <div className="sm muted">
                  {item.location.name} · {item.location.code}
                </div>
              </td>
              <td>
                {item.type.category} › {item.type.problemCode}
              </td>
              <td>
                <span className={'badge ' + (item.priority === 1 ? 'danger' : item.priority === 2 ? 'warning' : '')}>
                  P{item.priority} {['Emergency', 'Urgent', 'Routine', 'Planned'][item.priority - 1]}
                </span>
              </td>
              <td>
                <Sla item={item} now={clock} />
              </td>
              <td>
                <RequestStatus item={item} />
              </td>
              <td>{item.requesterName ?? 'Email requester'}</td>
              <td>{REQUEST_CHANNEL_LABELS[item.channel]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
