/**
 * CSV writing for exports. Cells that a spreadsheet could read as a formula get a leading
 * apostrophe, and values are quoted when they hold a comma, quote or line break.
 */
// A literal leading apostrophe before such a character is guarded too, so the reader can tell it from a guard.
const FORMULA_START = /^'*[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Only text is at risk: a number such as -5 is never read as a formula.
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
