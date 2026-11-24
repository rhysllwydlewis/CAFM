import type { ReactNode } from 'react';
import { parseColumnKeys, type GroupOption, type ListColumn } from '@cafm/shared';

/** The group and column fields for a list's filter form. They send with Apply filters, and the address keeps them. */
export function ListDisplayFields({
  columns,
  groups,
  group,
  chosen,
}: {
  columns: ListColumn[];
  groups: GroupOption[];
  group: string | undefined;
  /** The `cols` value from the address. */
  chosen: string | string[] | undefined;
}) {
  const wanted = new Set(parseColumnKeys(chosen));
  const all = wanted.size === 0 || !columns.some((column) => wanted.has(column.key));
  return (
    <>
      <label className="field">
        <span className="label">Group by</span>
        <select className="select" name="groupby" defaultValue={group ?? ''}>
          <option value="">No grouping</option>
          {groups.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <details className="field">
        <summary className="label">Columns</summary>
        <fieldset className="stack g2">
          <legend className="sr-only">Columns to show</legend>
          {columns.map((column) => (
            <label key={column.key} className="row g2">
              <input
                type="checkbox"
                name="cols"
                value={column.key}
                defaultChecked={column.locked || all || wanted.has(column.key)}
                disabled={column.locked}
              />
              {column.label}
            </label>
          ))}
        </fieldset>
      </details>
    </>
  );
}

/** One group's heading row and its rows, inside a table body. */
export function GroupRows({
  label,
  count,
  span,
  children,
}: {
  label: string;
  count: number;
  span: number;
  children: ReactNode;
}) {
  return (
    <>
      {label && (
        <tr>
          <th scope="colgroup" colSpan={span} className="medium">
            {label} <span className="muted">({count})</span>
          </th>
        </tr>
      )}
      {children}
    </>
  );
}
