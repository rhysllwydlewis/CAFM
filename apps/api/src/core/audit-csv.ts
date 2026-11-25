export interface AuditCsvRow {
  createdAt: Date;
  actor: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ip: string | null;
  changes: unknown;
}

/** A cell is quoted, and a leading = + - @ tab or return is defused so a spreadsheet won't run it as a formula. */
export function csvCell(value: string | null | undefined): string {
  let text = value ?? '';
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

/** The audit log as CSV: times in UTC, the changes as JSON. */
export function auditCsv(rows: AuditCsvRow[]): string {
  const header = ['When (UTC)', 'Who', 'Event', 'Record type', 'Record id', 'IP', 'Changes'];
  const lines = rows.map((r) =>
    [
      r.createdAt.toISOString(),
      r.actor,
      r.action,
      r.entityType,
      r.entityId,
      r.ip,
      r.changes == null ? '' : JSON.stringify(r.changes),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n';
}
