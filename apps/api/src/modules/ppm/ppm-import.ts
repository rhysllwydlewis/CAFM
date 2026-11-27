import type { Tx } from '@fmstead/db';
import {
  createPpmScheduleSchema,
  MAX_SCHEDULE_ASSETS,
  PPM_CALENDAR_UNITS,
  type CreatePpmSchedule,
} from '@fmstead/shared';
import { CsvError, parseCsv } from '../../core/csv-parse';
import { IMPORT_MAX_ROWS, type ImportIssue } from '../../core/import-fields';
import type { AuthContext } from '../../core/session';
import { assetScope } from '../assets/asset-scope';

/** Columns in the order the template uses. `assets` lists asset numbers separated by semicolons. */
export const PPM_COLUMNS = [
  'title',
  'discipline',
  'criticality',
  'frequency_type',
  'interval',
  'unit_or_meter',
  'mode',
  'starts_on',
  'duration_minutes',
  'lead_days',
  'priority',
  'assets',
] as const;
const REQUIRED = ['title', 'frequency_type', 'interval', 'unit_or_meter', 'starts_on', 'duration_minutes'] as const;

/** Which column each field of the schedule schema is read from, for reporting its problems. */
const FIELD_COLUMN: Record<string, string> = {
  title: 'title',
  discipline: 'discipline',
  criticality: 'criticality',
  mode: 'mode',
  startsOn: 'starts_on',
  durationMinutes: 'duration_minutes',
  leadDays: 'lead_days',
  priority: 'priority',
};

export interface PlannedSchedule {
  row: number;
  input: CreatePpmSchedule;
  /** Asset numbers, in the order the file lists them. */
  assetNumbers: string[];
  assetIds: string[];
}

export interface PpmPlan {
  /** Data rows in the file, whether or not they have problems. */
  rows: number;
  ordered: PlannedSchedule[];
  issues: ImportIssue[];
}

export const ppmTemplate = (): string => PPM_COLUMNS.join(',');

const WHOLE = /^\d+$/;

/**
 * Checks a PPM schedule file. Each row is read with the same rules as the schedule form, and its assets are looked up
 * by number among the assets this person can see. Every problem is collected so one preview lists them all.
 */
export async function planPpmImport(tx: Tx, auth: AuthContext, csv: string): Promise<PpmPlan> {
  const fail = (issues: ImportIssue[], rows = 0): PpmPlan => ({ rows, ordered: [], issues });
  let parsed;
  try {
    parsed = parseCsv(csv, IMPORT_MAX_ROWS);
  } catch (error) {
    if (error instanceof CsvError) return fail([{ row: 1, column: '', message: error.message }]);
    throw error;
  }
  const { header, rows, lines } = parsed;
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  header.forEach((column) => {
    if (seen.has(column)) issues.push({ row: 1, column, message: 'This column appears twice.' });
    else if (!(PPM_COLUMNS as readonly string[]).includes(column))
      issues.push({ row: 1, column, message: 'This column is not recognised. Remove it or rename it.' });
    seen.add(column);
  });
  for (const column of REQUIRED) {
    if (!seen.has(column)) issues.push({ row: 1, column, message: 'This column is missing.' });
  }
  if (issues.length) return fail(issues);
  if (!rows.length) return fail([{ row: 1, column: '', message: 'The file has no rows to import.' }]);

  const at = (column: string) => header.indexOf(column);
  const cell = (cells: string[], column: string) => (at(column) < 0 ? '' : (cells[at(column)] ?? '').trim());

  // Look every asset number up once, among the assets this person can see.
  const wanted = new Set<string>();
  for (const cells of rows) {
    for (const number of cell(cells, 'assets').split(';')) if (number.trim()) wanted.add(number.trim());
  }
  const found = new Map(
    (
      await tx.asset.findMany({
        where: { ...assetScope(auth), number: { in: [...wanted] }, status: { not: 'decommissioned' } },
        select: { id: true, number: true, meters: { select: { name: true } } },
      })
    ).map((asset) => [asset.number, asset]),
  );

  const ordered: PlannedSchedule[] = [];
  rows.forEach((cells, index) => {
    const row = lines[index]!;
    const before = issues.length;
    const problem = (column: string, message: string) => issues.push({ row, column, message });
    const whole = (column: string): number | undefined => {
      const text = cell(cells, column);
      if (!text) return undefined;
      if (!WHOLE.test(text)) {
        problem(column, 'Enter a whole number.');
        return undefined;
      }
      return Number(text);
    };

    const type = cell(cells, 'frequency_type').toLowerCase();
    const unitOrMeter = cell(cells, 'unit_or_meter');
    const intervalText = cell(cells, 'interval');
    let frequency: unknown;
    if (type === 'calendar') {
      if (!WHOLE.test(intervalText)) problem('interval', 'Enter a whole number of units, for example 3.');
      if (!(PPM_CALENDAR_UNITS as readonly string[]).includes(unitOrMeter.toLowerCase()))
        problem('unit_or_meter', `Use one of: ${PPM_CALENDAR_UNITS.join(', ')}.`);
      frequency = { type: 'calendar', unit: unitOrMeter.toLowerCase(), interval: Number(intervalText) };
    } else if (type === 'meter') {
      if (!unitOrMeter) problem('unit_or_meter', 'Enter the name of the meter.');
      frequency = { type: 'meter', meterName: unitOrMeter, interval: intervalText };
    } else {
      problem('frequency_type', 'Use calendar or meter.');
    }

    const duration = whole('duration_minutes');
    const leadDays = whole('lead_days');
    const priority = whole('priority');
    const result = createPpmScheduleSchema.safeParse({
      title: cell(cells, 'title'),
      discipline: cell(cells, 'discipline') || undefined,
      criticality: cell(cells, 'criticality').toLowerCase() || undefined,
      frequency,
      mode: cell(cells, 'mode').toLowerCase() || undefined,
      startsOn: cell(cells, 'starts_on'),
      durationMinutes: duration,
      leadDays,
      priority,
    });
    // Problems already reported against a column above are not repeated from the schema.
    const reported = new Set(issues.slice(before).map((issue) => issue.column));
    if (!result.success) {
      for (const issue of result.error.issues) {
        const [field, sub] = issue.path;
        const column =
          field === 'frequency'
            ? sub === 'interval'
              ? 'interval'
              : 'unit_or_meter'
            : (FIELD_COLUMN[String(field)] ?? '');
        if (reported.has(column) || (field === 'frequency' && !frequency)) continue;
        reported.add(column);
        problem(column, issue.message === 'Required' ? 'Enter a value.' : issue.message);
      }
    }

    const numbers = cell(cells, 'assets')
      .split(';')
      .map((number) => number.trim())
      .filter(Boolean);
    if (numbers.length > MAX_SCHEDULE_ASSETS)
      problem('assets', `A schedule can have at most ${MAX_SCHEDULE_ASSETS} assets.`);
    if (new Set(numbers).size !== numbers.length) problem('assets', 'An asset can only be on a schedule once.');
    const ids: string[] = [];
    for (const number of numbers) {
      const asset = found.get(number);
      if (!asset) {
        problem('assets', `No asset in service has the number ${number}.`);
        continue;
      }
      if (type === 'meter' && !asset.meters.some((meter) => meter.name === unitOrMeter))
        problem('assets', `${number} has no meter called ${unitOrMeter}.`);
      ids.push(asset.id);
    }

    if (result.success && issues.length === before)
      ordered.push({
        row,
        input: { ...result.data, assets: ids.map((assetId) => ({ assetId })) },
        assetNumbers: numbers,
        assetIds: ids,
      });
  });
  return issues.length ? fail(issues, rows.length) : { rows: rows.length, ordered, issues };
}
