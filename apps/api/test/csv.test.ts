import { expect, it } from 'vitest';
import { csvCell, toCsv } from '../src/core/csv';

it('quotes cells that need it and defuses spreadsheet formulas', () => {
  expect(csvCell('plain')).toBe('plain');
  expect(csvCell('a,b')).toBe('"a,b"');
  expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  expect(csvCell('two\nlines')).toBe('"two\nlines"');
  expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
  expect(csvCell('-5')).toBe("'-5");
  expect(csvCell(null)).toBe('');
  expect(csvCell(12.5)).toBe('12.5');
  expect(toCsv(['a', 'b'], [[1, 'x,y']])).toBe('a,b\r\n1,"x,y"\r\n');
});
