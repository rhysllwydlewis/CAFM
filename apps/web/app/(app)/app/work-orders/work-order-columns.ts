import type { GroupOption, ListColumn } from '@cafm/shared';

export const WORK_ORDER_COLUMNS: ListColumn[] = [
  { key: 'ref', label: 'Ref', locked: true },
  { key: 'title', label: 'Title and location', locked: true },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'assignee', label: 'Assigned to' },
  { key: 'sla', label: 'SLA (fix)' },
];

export const WORK_ORDER_GROUPS: GroupOption[] = [
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Assigned to' },
  { key: 'location', label: 'Location' },
];
