import { describe, expect, it } from 'vitest';
import { auditCsv, csvCell } from '../src/core/audit-csv';

describe('audit CSV', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('defuses a leading formula character in %j', (value) => {
    expect(csvCell(value)).toBe('"\'' + value + '"');
  });

  it('quotes cells and doubles quotes, and leaves ordinary text alone', () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell(null)).toBe('""');
  });

  it('writes times in UTC and the changes as JSON, defusing a formula in the person name', () => {
    const csv = auditCsv([
      {
        createdAt: new Date('2026-01-02T03:04:05.000Z'),
        actor: '=cmd()',
        action: 'x.y',
        entityType: 'thing',
        entityId: null,
        ip: null,
        changes: { a: 1 },
      },
    ]);
    expect(csv.split('\r\n')[1]).toBe('"2026-01-02T03:04:05.000Z","\'=cmd()","x.y","thing","","","{""a"":1}"');
  });
});
