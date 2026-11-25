/**
 * CSV reading for imports (RFC 4180): quoted cells, doubled quotes, line breaks inside quotes, and a
 * leading byte order mark from spreadsheets. The apostrophe the exporter adds in front of a cell that
 * could be read as a formula is removed again, so an exported file imports back unchanged.
 */
const GUARDED = /^'('*[=+\-@\t\r])/;

export interface ParsedCsv {
  header: string[];
  rows: string[][];
  /** The line in the file each row starts on (the header is line 1), so blank lines do not shift reports. */
  lines: number[];
}

export class CsvError extends Error {}

export function parseCsv(input: string, maxRows = 1000): ParsedCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: string[][] = [];
  const recordLines: number[] = [];
  let line = 1;
  let rowLine = 1;
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let started = false;
  const endCell = () => {
    row.push(cell.replace(GUARDED, '$1'));
    cell = '';
  };
  const endRow = () => {
    endCell();
    // Blank lines carry no data.
    if (row.some((value) => value.trim() !== '')) {
      records.push(row);
      recordLines.push(rowLine);
    }
    row = [];
    started = false;
    if (records.length > maxRows + 1) throw new CsvError(`The file has more than ${maxRows} rows.`);
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char !== '"') {
        cell += char;
        if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) line += 1;
      } else if (text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = false;
    } else if (char === '"' && cell === '') {
      quoted = true;
      started = true;
    } else if (char === ',') {
      started = true;
      endCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      endRow();
      line += 1;
      rowLine = line;
    } else {
      started = true;
      cell += char;
    }
  }
  if (quoted) throw new CsvError('A quoted value is not closed.');
  if (started || cell !== '') endRow();
  const [header, ...rows] = records;
  if (!header) throw new CsvError('The file is empty.');
  return { header: header.map((name) => name.trim()), rows, lines: recordLines.slice(1) };
}
