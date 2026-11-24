'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  groupRows,
  REQUEST_CHANNEL_LABELS,
  REQUEST_STATUS_LABELS,
  visibleColumns,
  type RequestSummary,
} from '@cafm/shared';
import { REQUEST_COLUMNS } from './request-columns';
import { RequestBulkBar } from './request-bulk-bar';
import { GroupRows } from '@/components/list-display';
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

export function RequestSla({ item, now }: { item: RequestSummary; now: number }) {
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

const PRIORITY_NAMES = ['Emergency', 'Urgent', 'Routine', 'Planned'];

const GROUP_LABELS: Record<string, (item: RequestSummary) => string> = {
  status: (item) => REQUEST_STATUS_LABELS[item.linkedStatus ?? item.status],
  priority: (item) => 'P' + item.priority + ' ' + (PRIORITY_NAMES[item.priority - 1] ?? ''),
  category: (item) => item.type.category,
  channel: (item) => REQUEST_CHANNEL_LABELS[item.channel],
  location: (item) => item.location.name + ' · ' + item.location.code,
};

export function RequestTable({
  items,
  now,
  own = false,
  columns: chosen,
  group,
  bulk = false,
}: {
  items: RequestSummary[];
  now: number;
  own?: boolean;
  /** The `cols` value from the address. */
  columns?: string | string[];
  group?: string;
  /** Lets rows be ticked for a bulk action. Only for people who manage requests. */
  bulk?: boolean;
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
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
  const shown = new Set(visibleColumns(REQUEST_COLUMNS, chosen).map(({ key }) => key));
  const has = (key: string) => shown.has(key);
  const span = shown.size + (bulk ? 1 : 0);
  // Only rows still on the page count, so a row that has gone from the list can't be changed unseen.
  const selected = items.filter(({ id }) => ticked.has(id));
  const toggle = (id: string, on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <>
      {bulk && (
        <RequestBulkBar
          selected={selected}
          onDone={(changed) => setTicked((current) => new Set([...current].filter((id) => !changed.includes(id))))}
        />
      )}
      <div className={styles.tableWrap} role="region" aria-label="Request results" tabIndex={0}>
        <table className="tbl">
          <thead>
            <tr>
              {bulk && (
                <th scope="col">
                  <input
                    type="checkbox"
                    aria-label="Select all requests on this page"
                    checked={selected.length === items.length}
                    onChange={(event) =>
                      setTicked(event.target.checked ? new Set(items.map(({ id }) => id)) : new Set())
                    }
                  />
                </th>
              )}
              {REQUEST_COLUMNS.filter(({ key }) => has(key)).map(({ key, label }) => (
                <th key={key} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupRows(items, group ? GROUP_LABELS[group] : undefined).map((section) => (
              <GroupRows key={section.label} label={section.label} count={section.items.length} span={span}>
                {section.items.map((item) => (
                  <tr key={item.id} aria-selected={bulk ? ticked.has(item.id) : undefined}>
                    {bulk && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={'Select ' + item.number}
                          checked={ticked.has(item.id)}
                          onChange={(event) => toggle(item.id, event.target.checked)}
                        />
                      </td>
                    )}
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
                    {has('category') && (
                      <td>
                        {item.type.category} › {item.type.problemCode}
                      </td>
                    )}
                    {has('priority') && (
                      <td>
                        <span
                          className={'badge ' + (item.priority === 1 ? 'danger' : item.priority === 2 ? 'warning' : '')}
                        >
                          P{item.priority} {PRIORITY_NAMES[item.priority - 1]}
                        </span>
                      </td>
                    )}
                    {has('sla') && (
                      <td>
                        <RequestSla item={item} now={clock} />
                      </td>
                    )}
                    {has('status') && (
                      <td>
                        <RequestStatus item={item} />
                      </td>
                    )}
                    {has('requester') && <td>{item.requesterName ?? 'Email requester'}</td>}
                    {has('channel') && <td>{REQUEST_CHANNEL_LABELS[item.channel]}</td>}
                  </tr>
                ))}
              </GroupRows>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
