import type { FieldDefinition } from '@fmstead/config-engine';

/** One problem found in an import file. `row` is the line number in the file (the header is line 1). */
export interface ImportIssue {
  row: number;
  column: string;
  message: string;
}

export const IMPORT_MAX_ROWS = 1000;
/** JSON escaping can multiply this by six, so the API reads JSON bodies up to 600 kB (see app.ts). */
export const IMPORT_MAX_CHARS = 90_000;

/**
 * Turns the text in a CSV cell into the value a custom field stores. A cell that can't be read as the
 * field's type is passed on unchanged, so the field's own validation reports it in plain words.
 */
export function coerceCustomCell(field: FieldDefinition, text: string): unknown {
  const value = text.trim();
  switch (field.type) {
    case 'number':
      return value !== '' && Number.isFinite(Number(value)) ? Number(value) : value;
    case 'checkbox': {
      const lower = value.toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(lower)) return true;
      if (['false', 'no', 'n', '0'].includes(lower)) return false;
      return value;
    }
    case 'currency':
    case 'multi_select': {
      if (field.type === 'multi_select' && !value.startsWith('[')) return value.split(';').map((part) => part.trim());
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }
    default:
      return value;
  }
}

/** Splits `custom.<key>` columns from the rest, and reports the columns this import does not know. */
export function customKey(column: string): string | null {
  return column.startsWith('custom.') ? column.slice('custom.'.length) : null;
}
