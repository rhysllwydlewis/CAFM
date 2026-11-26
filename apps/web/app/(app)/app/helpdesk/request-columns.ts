import type { GroupOption, ListColumn } from '@fmstead/shared';

export const REQUEST_COLUMNS: ListColumn[] = [
  { key: 'ref', label: 'Ref', locked: true },
  { key: 'request', label: 'Request', locked: true },
  { key: 'category', label: 'Category' },
  { key: 'priority', label: 'Priority' },
  { key: 'sla', label: 'SLA (response)' },
  { key: 'status', label: 'Status' },
  { key: 'requester', label: 'Requester' },
  { key: 'channel', label: 'Channel' },
];

export const REQUEST_GROUPS: GroupOption[] = [
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'category', label: 'Category' },
  { key: 'channel', label: 'Channel' },
  { key: 'location', label: 'Location' },
];
