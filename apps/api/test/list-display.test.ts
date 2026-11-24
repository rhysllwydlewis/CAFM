import { describe, expect, it } from 'vitest';
import { groupRows, parseColumnKeys, parseGroup, visibleColumns } from '@cafm/shared';

const columns = [
  { key: 'ref', label: 'Ref', locked: true },
  { key: 'status', label: 'Status' },
  { key: 'owner', label: 'Owner' },
];

describe('list display', () => {
  it('reads repeated and comma-separated column keys', () => {
    expect(parseColumnKeys(['a', 'b,c'])).toEqual(['a', 'b', 'c']);
    expect(parseColumnKeys('a,b')).toEqual(['a', 'b']);
    expect(parseColumnKeys(undefined)).toEqual([]);
  });

  it('shows every column when none is chosen or none is known', () => {
    expect(visibleColumns(columns, undefined)).toHaveLength(3);
    expect(visibleColumns(columns, 'nonsense')).toHaveLength(3);
  });

  it('keeps locked columns and the list order', () => {
    expect(visibleColumns(columns, 'owner').map((c) => c.key)).toEqual(['ref', 'owner']);
    expect(visibleColumns(columns, ['owner', 'status']).map((c) => c.key)).toEqual(['ref', 'status', 'owner']);
  });

  it('accepts only group keys the list offers', () => {
    const options = [{ key: 'status', label: 'Status' }];
    expect(parseGroup('status', options)).toBe('status');
    expect(parseGroup('custom.secret', options)).toBeUndefined();
    expect(parseGroup(undefined, options)).toBeUndefined();
  });

  it('groups in order of first appearance', () => {
    const groups = groupRows([1, 2, 3, 4, 5], (n) => (n % 2 ? 'odd' : 'even'));
    expect(groups).toEqual([
      { label: 'odd', items: [1, 3, 5] },
      { label: 'even', items: [2, 4] },
    ]);
    expect(groupRows([1, 2], undefined)).toEqual([{ label: '', items: [1, 2] }]);
  });
});
