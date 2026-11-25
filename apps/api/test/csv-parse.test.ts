import { expect, it } from 'vitest';
import { csvCell, toCsv } from '../src/core/csv';
import { CsvError, parseCsv } from '../src/core/csv-parse';

it('reads quotes, doubled quotes, line breaks inside quotes, a byte order mark and blank lines', () => {
  const parsed = parseCsv('﻿code,name\r\nA,"Smith, ""J"""\n\n"B","two\nlines"\r\n');
  expect(parsed.header).toEqual(['code', 'name']);
  expect(parsed.rows).toEqual([
    ['A', 'Smith, "J"'],
    ['B', 'two\nlines'],
  ]);
});

it('reads a last row without a line break, and keeps empty cells', () => {
  expect(parseCsv('a,b,c\n1,,3').rows).toEqual([['1', '', '3']]);
});

it('round-trips what the exporter writes, including guarded formula cells', () => {
  const rows = [
    ['=SUM(A1)', '-5 left', 'plain'],
    ['@home', 'a,b', 'say "hi"'],
  ];
  const parsed = parseCsv(toCsv(['x', 'y', 'z'], rows));
  expect(parsed.rows).toEqual(rows);
  expect(csvCell('=1')).toBe("'=1");
});

it('refuses an empty file, an unclosed quote and too many rows', () => {
  expect(() => parseCsv('')).toThrow(CsvError);
  expect(() => parseCsv('a\n"open')).toThrow(/not closed/);
  expect(() => parseCsv('a\n1\n2\n3', 2)).toThrow(/more than 2 rows/);
  expect(parseCsv('a\n1\n2', 2).rows).toHaveLength(2);
});
