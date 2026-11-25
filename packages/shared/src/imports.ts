import { z } from 'zod';

/** A CSV file sent for import. The text travels in a JSON body, so the size stays under the 100 kB body limit. */
export const importFileSchema = z
  .object({
    csv: z
      .string()
      .min(1, 'Choose a file to import')
      .max(90_000, 'The file is too large. Split it into smaller files.'),
    fileName: z.string().trim().max(200).optional(),
  })
  .strict();

export interface ImportIssueRecord {
  /** Line in the file; the header is line 1. */
  row: number;
  column: string;
  message: string;
}

export interface ImportPreview {
  /** Rows the file holds. */
  rows: number;
  /** Records that would be made. Zero when there are problems. */
  creates: number;
  issueCount: number;
  /** The first problems, at most 200. The error report holds them all. */
  issues: ImportIssueRecord[];
  sample: { row: number; code: string; name: string; kind: string; parentCode: string | null }[];
}

export interface ImportBatchRecord {
  id: string;
  entityType: string;
  fileName: string | null;
  status: 'applied' | 'rolled_back';
  rowCount: number;
  createdAt: string;
  rolledBackAt: string | null;
}
