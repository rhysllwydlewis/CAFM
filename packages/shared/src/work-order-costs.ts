import { z } from 'zod';

const shortText = (max: number) => z.string().trim().min(1).max(max);
const version = z.number().int().positive();

export const COST_KINDS = ['labour', 'parts', 'subcontract', 'expense'] as const;
export type CostKind = (typeof COST_KINDS)[number];
export const COST_KIND_LABELS: Record<CostKind, string> = {
  labour: 'Labour',
  parts: 'Parts and materials',
  subcontract: 'Sub-contract',
  expense: 'Expenses',
};

export const LABOUR_TYPES = ['on_site', 'travel', 'overtime'] as const;
export type LabourType = (typeof LABOUR_TYPES)[number];
export const LABOUR_TYPE_LABELS: Record<LabourType, string> = {
  on_site: 'On site',
  travel: 'Travel',
  overtime: 'Overtime',
};

/**
 * Limits that keep every figure a whole number a computer holds exactly: 10,000 units at £1,000,000 each is
 * still below 2^53, and no single cost or limit can be more than £10 million.
 */
export const MAX_QUANTITY_MILLI = 10_000_000;
export const MAX_UNIT_COST_MINOR = 100_000_000;
export const MAX_JOB_COST_MINOR = 1_000_000_000;
/** An hourly labour rate is capped so a whole day of time (24 hours) never costs more than one job can hold. */
export const MAX_HOURLY_RATE_MINOR = 40_000_000;

/** A job holds at most this many cost entries, which is far more than a reactive job needs. */
export const MAX_COSTS_PER_JOB = 200;

/** Quantity is held in thousandths and money in minor units, so the amount is whole-number arithmetic, rounded half up. */
export function costAmountMinor(quantityMilli: number, unitCostMinor: number): number {
  return Math.floor((quantityMilli * unitCostMinor + 500) / 1000);
}

/** "2.5" is 2500 thousandths. At most three decimal places, and above zero. Null when it isn't a quantity. */
export function parseQuantityMilli(text: string): number | null {
  const match = /^\s*(\d{1,4})(?:\.(\d{1,3}))?\s*$/.exec(text);
  if (!match) return null;
  const milli = Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'));
  return milli > 0 && milli <= MAX_QUANTITY_MILLI ? milli : null;
}

/** "48.90" or "£1,250" in whole minor units, without going through a floating point number. Null when it isn't money. */
export function parseMoneyMinor(text: string, max = MAX_JOB_COST_MINOR): number | null {
  const match = /^\s*£?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?\s*$/.exec(text);
  if (!match) return null;
  const minor = Number(match[1]!.replaceAll(',', '')) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return minor <= max ? minor : null;
}

/** Display only: the money is held as whole minor units. */
export function formatMinor(minor: number, currency = 'GBP'): string {
  const format = new Intl.NumberFormat('en-GB', { style: 'currency', currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(minor / 10 ** digits);
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date.')
  // JavaScript rolls 31 February over to 3 March, so the date has to come back unchanged to be a real one.
  .refine((value) => {
    const parsed = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Enter a date.')
  .refine(
    (value) => value <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    'Enter a date that has happened.',
  );
const common = {
  description: shortText(200),
  reference: shortText(80).optional(),
  incurredOn: isoDate,
  /** Needed when the cost takes the job over its not-to-exceed limit. It is kept with the cost. */
  overNteReason: shortText(500).optional(),
};
const quantity = z.number().int().min(1).max(MAX_QUANTITY_MILLI);
const unitCost = z.number().int().min(0).max(MAX_UNIT_COST_MINOR);
const amount = z.number().int().min(0).max(MAX_JOB_COST_MINOR);

export const addCostSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('labour'),
      labourType: z.enum(LABOUR_TYPES),
      quantityMilli: quantity,
      unitCostMinor: unitCost,
      ...common,
    })
    .strict(),
  z.object({ kind: z.literal('parts'), quantityMilli: quantity, unitCostMinor: unitCost, ...common }).strict(),
  z.object({ kind: z.literal('subcontract'), amountMinor: amount, ...common }).strict(),
  z.object({ kind: z.literal('expense'), amountMinor: amount, ...common }).strict(),
]);
export type AddCost = z.infer<typeof addCostSchema>;

export const setNteSchema = z
  .object({ version, nteMinor: z.number().int().min(0).max(MAX_JOB_COST_MINOR).nullable() })
  .strict();

export type WorkOrderCostItem = {
  id: string;
  kind: CostKind;
  labourType: LabourType | null;
  description: string;
  reference: string | null;
  quantityMilli: number;
  unitCostMinor: number;
  amountMinor: number;
  incurredOn: string;
  recordedByName: string | null;
  overNte: boolean;
  overNteReason: string | null;
  createdAt: string;
};
export type WorkOrderCosts = {
  currency: string;
  nteMinor: number | null;
  totalMinor: number;
  byKind: Record<CostKind, number>;
  items: WorkOrderCostItem[];
};
