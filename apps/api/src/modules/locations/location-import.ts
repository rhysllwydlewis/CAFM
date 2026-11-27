import { validateCustom, type FieldDefinition } from '@fmstead/config-engine';
import type { Tx } from '@fmstead/db';
import { canContain, createLocationSchema, LOCATION_KINDS, type LocationKind } from '@fmstead/shared';
import { coerceCustomCell, customKey, type ImportIssue } from '../../core/import-fields';
import { CsvError, parseCsv } from '../../core/csv-parse';
import { IMPORT_MAX_ROWS } from '../../core/import-fields';

/** Columns in the order the template and the export use. */
export const LOCATION_COLUMNS = [
  'code',
  'name',
  'kind',
  'status',
  'parent_code',
  'address',
  'use_class',
  'gross_area',
  'net_area',
] as const;
const REQUIRED = ['code', 'name', 'kind'] as const;

/** Where a field in the create schema shows up in the file. */
const SCHEMA_COLUMN: Record<string, string> = {
  code: 'code',
  name: 'name',
  kind: 'kind',
  status: 'status',
  'details.address': 'address',
  'details.useClass': 'use_class',
  'details.grossArea': 'gross_area',
  'details.netArea': 'net_area',
};

export interface PlannedLocation {
  /** Line in the file, for error messages. */
  row: number;
  code: string;
  name: string;
  kind: LocationKind;
  status: string;
  parentCode: string | null;
  details: Record<string, unknown>;
  custom: Record<string, unknown>;
}

export interface LocationPlan {
  /** Parents come before their children, so creating in this order always has the parent in place. */
  ordered: PlannedLocation[];
  issues: ImportIssue[];
  /** Existing locations a row names as its parent, by code. */
  existingParents: Map<string, { id: string; kind: LocationKind }>;
}

function number(text: string): number | string {
  const value = text.trim();
  return value !== '' && Number.isFinite(Number(value)) ? Number(value) : value;
}

export function locationTemplate(fields: Iterable<string>): string {
  return [...LOCATION_COLUMNS, ...[...fields].map((key) => `custom.${key}`)].join(',');
}

export async function planLocationImport(
  tx: Tx,
  tenantId: string,
  csv: string,
  fields: ReadonlyMap<string, FieldDefinition>,
  siteLimit: number | null,
): Promise<LocationPlan> {
  const issues: ImportIssue[] = [];
  let parsed;
  try {
    parsed = parseCsv(csv, IMPORT_MAX_ROWS);
  } catch (error) {
    if (error instanceof CsvError)
      return { ordered: [], existingParents: new Map(), issues: [{ row: 1, column: '', message: error.message }] };
    throw error;
  }
  const { header, rows, lines } = parsed;
  const known = new Set<string>([...LOCATION_COLUMNS, ...[...fields.keys()].map((key) => `custom.${key}`)]);
  const seen = new Set<string>();
  header.forEach((column) => {
    if (seen.has(column)) issues.push({ row: 1, column, message: 'This column appears twice.' });
    else if (!known.has(column))
      issues.push({ row: 1, column, message: 'This column is not recognised. Remove it or rename it.' });
    seen.add(column);
  });
  for (const column of REQUIRED) {
    if (!seen.has(column)) issues.push({ row: 1, column, message: 'This column is missing.' });
  }
  if (issues.length) return { ordered: [], existingParents: new Map(), issues };
  if (!rows.length) {
    return {
      ordered: [],
      existingParents: new Map(),
      issues: [{ row: 1, column: '', message: 'The file has no rows to import.' }],
    };
  }

  const planned: PlannedLocation[] = [];
  const codes = new Map<string, number>();
  rows.forEach((cells, index) => {
    const row = lines[index] ?? index + 2;
    const at = (column: string) => (cells[header.indexOf(column)] ?? '').trim();
    if (cells.length > header.length && cells.slice(header.length).some((cell) => cell.trim() !== '')) {
      issues.push({ row, column: '', message: 'This row has more values than the file has columns.' });
      return;
    }
    const details: Record<string, unknown> = {};
    if (at('address')) details.address = at('address');
    if (at('use_class')) details.useClass = at('use_class');
    if (at('gross_area')) details.grossArea = number(at('gross_area'));
    if (at('net_area')) details.netArea = number(at('net_area'));
    const rawCustom: Record<string, unknown> = {};
    for (const column of header) {
      const key = customKey(column);
      const field = key ? fields.get(key) : undefined;
      if (field && at(column) !== '') rawCustom[field.key] = coerceCustomCell(field, at(column));
    }
    const result = createLocationSchema.safeParse({
      code: at('code'),
      name: at('name'),
      kind: at('kind').toLowerCase(),
      status: at('status') ? at('status').toLowerCase() : undefined,
      parentId: null,
      details,
      custom: {},
    });
    let ok = true;
    if (!result.success) {
      ok = false;
      for (const issue of result.error.issues) {
        const column = SCHEMA_COLUMN[issue.path.join('.')] ?? SCHEMA_COLUMN[String(issue.path[0])] ?? '';
        const kindProblem = column === 'kind' ? `Use one of: ${LOCATION_KINDS.join(', ')}.` : issue.message;
        issues.push({ row, column, message: kindProblem });
      }
    }
    const custom = validateCustom([...fields.values()], rawCustom);
    if (!custom.success) {
      ok = false;
      for (const [key, message] of Object.entries(custom.errors))
        issues.push({ row, column: `custom.${key}`, message });
    }
    if (!ok || !result.success || !custom.success) return;
    const { code } = result.data;
    const first = codes.get(code);
    if (first !== undefined) {
      issues.push({ row, column: 'code', message: `The code ${code} is already used on line ${first}.` });
      return;
    }
    codes.set(code, row);
    planned.push({
      row,
      code,
      name: result.data.name,
      kind: result.data.kind,
      status: result.data.status,
      parentCode: at('parent_code').toUpperCase() || null,
      details: result.data.details ?? {},
      custom: custom.data,
    });
  });

  // Codes that already exist cannot be created again, and a parent may already exist.
  const wanted = [
    ...new Set([
      ...planned.map(({ code }) => code),
      ...planned.flatMap(({ parentCode }) => (parentCode ? [parentCode] : [])),
    ]),
  ];
  const existing = new Map(
    (
      await tx.location.findMany({
        where: { tenantId, code: { in: wanted } },
        select: { id: true, code: true, kind: true },
      })
    ).map((row) => [row.code, { id: row.id, kind: row.kind as LocationKind }]),
  );
  const existingParents = new Map<string, { id: string; kind: LocationKind }>();
  const inFile = new Map(planned.map((item) => [item.code, item]));
  const underExistingSite = new Set(
    (
      await tx.locationPath.findMany({
        where: {
          tenantId,
          descendantId: { in: [...existing.values()].map(({ id }) => id) },
          ancestor: { kind: 'site' },
        },
        select: { descendantId: true },
      })
    ).map(({ descendantId }) => descendantId),
  );

  const valid: PlannedLocation[] = [];
  const memo = new Map<string, boolean | null>();
  /** Whether a row in the file sits at or below a site. A loop returns null. */
  const underSite = (item: PlannedLocation, trail: Set<string>): boolean | null => {
    if (item.kind === 'site') return true;
    if (!item.parentCode) return false;
    const parent = inFile.get(item.parentCode);
    if (parent) {
      if (trail.has(parent.code)) return null;
      if (memo.has(parent.code)) return memo.get(parent.code)!;
      const result = underSite(parent, new Set([...trail, item.code]));
      memo.set(parent.code, result);
      return result;
    }
    const found = existing.get(item.parentCode);
    return !!found && (found.kind === 'site' || underExistingSite.has(found.id));
  };

  for (const item of planned) {
    const problems: ImportIssue[] = [];
    if (existing.has(item.code))
      problems.push({
        row: item.row,
        column: 'code',
        message: `The code ${item.code} already exists. Import only adds new locations.`,
      });
    if (item.parentCode) {
      const parent = inFile.get(item.parentCode) ?? existing.get(item.parentCode);
      if (!parent)
        problems.push({
          row: item.row,
          column: 'parent_code',
          message: `No location has the code ${item.parentCode}.`,
        });
      else if (!canContain(parent.kind, item.kind))
        problems.push({
          row: item.row,
          column: 'parent_code',
          message: `A ${item.kind} can’t go inside a ${parent.kind}.`,
        });
      else if (!inFile.has(item.parentCode)) existingParents.set(item.parentCode, existing.get(item.parentCode)!);
    }
    const parentInSite = item.parentCode
      ? inFile.has(item.parentCode)
        ? underSite(inFile.get(item.parentCode)!, new Set([item.code]))
        : underExistingSite.has(existing.get(item.parentCode)?.id ?? '') ||
          existing.get(item.parentCode)?.kind === 'site'
      : false;
    if (parentInSite === null)
      problems.push({ row: item.row, column: 'parent_code', message: 'The parents in this file form a loop.' });
    else if (!problems.some(({ column }) => column === 'parent_code')) {
      const requiresSite = !['portfolio', 'region', 'site'].includes(item.kind);
      if (requiresSite !== parentInSite)
        problems.push({
          row: item.row,
          column: 'parent_code',
          message: requiresSite ? 'Choose a parent within a site.' : 'Choose a parent outside any site.',
        });
    }
    if (problems.length) issues.push(...problems);
    else valid.push(item);
  }

  if (siteLimit !== null && !issues.length) {
    const sites = valid.filter(({ kind }) => kind === 'site').length;
    const used = await tx.location.count({ where: { tenantId, kind: 'site' } });
    if (sites && used + sites > siteLimit)
      issues.push({
        row: 1,
        column: 'kind',
        message: `Your plan includes ${siteLimit} sites and you have ${used}. This file adds ${sites}.`,
      });
  }

  // Parents first. A row whose parent is later in the file waits until the parent has been placed.
  const ordered: PlannedLocation[] = [];
  const placed = new Set<string>();
  let pending = valid;
  while (pending.length) {
    const next = pending.filter(({ parentCode }) => !parentCode || !inFile.has(parentCode) || placed.has(parentCode));
    if (!next.length) break;
    for (const item of next) {
      ordered.push(item);
      placed.add(item.code);
    }
    pending = pending.filter((item) => !placed.has(item.code));
  }
  issues.sort((a, b) => a.row - b.row);
  return { ordered, issues, existingParents };
}
