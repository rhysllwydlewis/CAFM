import type { AssetRecord } from '@cafm/shared';

export const route = '/app/assets';
export const validAssetId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

export const STATUS_LABELS: Record<AssetRecord['status'], string> = {
  in_service: 'In service',
  out_of_service: 'Out of service',
  alarm: 'Alarm',
  spare: 'Spare',
  decommissioned: 'Decommissioned',
};
export const CRITICALITY_LABELS: Record<AssetRecord['criticality'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const STATUS_TONE: Record<AssetRecord['status'], string> = {
  in_service: 'success',
  out_of_service: 'danger',
  alarm: 'danger',
  spare: '',
  decommissioned: 'outline',
};
const CONDITION_TONE = { A: 'success', B: 'success', C: 'warning', D: 'danger' } as const;
const CRITICALITY_TONE: Record<AssetRecord['criticality'], string> = {
  low: '',
  medium: '',
  high: 'warning',
  critical: 'danger',
};

/** The status as a badge with a dot, so it never relies on colour alone. */
export function StatusBadge({ status }: { status: AssetRecord['status'] }) {
  return (
    <span className={`badge ${STATUS_TONE[status]}`}>
      <span className="d" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** A–D. The word "Condition" is read out, and shown too when `verbose`, so the single letter makes sense. */
export function ConditionBadge({ condition, verbose }: { condition: AssetRecord['condition']; verbose?: boolean }) {
  if (!condition) return <span className="faint">Not assessed</span>;
  return (
    <span className={`badge ${CONDITION_TONE[condition]}`}>
      <span className={verbose ? undefined : 'sr-only'}>Condition </span>
      {condition}
    </span>
  );
}

export function CriticalityBadge({
  criticality,
  verbose,
}: {
  criticality: AssetRecord['criticality'];
  verbose?: boolean;
}) {
  return (
    <span className={`badge ${CRITICALITY_TONE[criticality]}`}>
      {verbose && 'Criticality: '}
      {CRITICALITY_LABELS[criticality]}
    </span>
  );
}

/** Whole pence and a currency code, shown as money. */
export function formatMoney(cost: { amountMinor: number; currency: string } | null): string {
  if (!cost) return '';
  const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: cost.currency });
  return formatter.format(cost.amountMinor / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2));
}

export const formatDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'))
    : '';

/** The location as people say it: "Cardiff HQ › Basement › Plant room B1". */
export const locationLabel = (path: string[]) => path.join(' › ');

/** The decimal places a currency uses: 2 for pounds, 0 for yen. */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** An amount typed as 18500 or 18500.50 (a symbol or commas are fine), as whole minor units. Null if it isn't one. */
export function moneyToMinor(text: string, digits = 2): number | null {
  const pattern = digits > 0 ? new RegExp(`^(\\d+)(?:\\.(\\d{1,${digits}}))?$`) : /^(\d+)$/;
  const match = text
    .trim()
    .replace(/^[£$€]/, '')
    .replace(/,/g, '')
    .match(pattern);
  if (!match) return null;
  const minor = Number(match[1]) * 10 ** digits + Number((match[2] ?? '').padEnd(digits, '0') || 0);
  return Number.isSafeInteger(minor) ? minor : null;
}

export const minorToMoney = (amountMinor: number, digits = 2) => (amountMinor / 10 ** digits).toFixed(digits);
