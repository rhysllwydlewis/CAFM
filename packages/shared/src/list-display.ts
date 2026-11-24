/** Which columns a list shows and how it is grouped. Both live in the address, so a saved view keeps them. */

export interface ListColumn {
  key: string;
  label: string;
  /** Shown whatever is chosen, because the row is unusable without it. */
  locked?: boolean;
}

export interface GroupOption {
  key: string;
  label: string;
}

type Raw = string | string[] | undefined;

/** The column keys in an address: repeated `cols` params, or one comma-separated value from a saved view. */
export function parseColumnKeys(raw: Raw): string[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.flatMap((item) => item.split(',')).filter(Boolean);
}

/** The columns to show, in the list's own order. Unknown keys are ignored, locked columns always stay, and nothing chosen means all. */
export function visibleColumns<C extends ListColumn>(columns: C[], raw: Raw): C[] {
  const wanted = new Set(parseColumnKeys(raw));
  const chosen = columns.filter((column) => wanted.has(column.key));
  if (!chosen.length) return columns;
  return columns.filter((column) => column.locked || wanted.has(column.key));
}

/** A group key from the address, or nothing when it is not one the list offers. */
export function parseGroup(raw: Raw, options: GroupOption[]): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return options.some((option) => option.key === value) ? value : undefined;
}

/** Splits one page of rows into groups, in the order each group first appears, so the sort still decides the order. */
export function groupRows<T>(items: T[], labelOf: ((item: T) => string) | undefined): { label: string; items: T[] }[] {
  if (!labelOf) return [{ label: '', items }];
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = labelOf(item);
    const bucket = groups.get(label);
    if (bucket) bucket.push(item);
    else groups.set(label, [item]);
  }
  return [...groups].map(([label, rows]) => ({ label, items: rows }));
}
