import { PPM_CRITICALITY_LABELS, type PpmCriticality } from '@cafm/shared';

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const month = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });

const asDate = (value: string) => new Date(value + 'T00:00:00Z');
/** "23 Nov" */
export const shortDay = (value: string) => day.format(asDate(value));
/** "23 Nov 2026" */
export const longDay = (value: string) => dayYear.format(asDate(value));
/** "December 2026", from "2026-12". */
export const monthName = (value: string) => month.format(asDate(value + '-01'));
export const monthAbbr = (value: string) => monthShort.format(asDate(value));

/** Hours from minutes, to one decimal place and without a trailing .0. */
export const hours = (minutes: number) => (Math.round((minutes / 60) * 10) / 10).toLocaleString('en-GB');

export const criticalityBadge = (criticality: PpmCriticality) =>
  criticality === 'statutory' ? 'danger' : criticality === 'mandatory' ? 'warning' : 'outline';
export const criticalityLabel = (criticality: PpmCriticality) => PPM_CRITICALITY_LABELS[criticality];
