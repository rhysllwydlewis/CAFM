import 'server-only';
import type { AttachmentItem } from '@cafm/shared';
import { apiGet } from './api';

export async function attachmentList(path: string): Promise<AttachmentItem[]> {
  const response = await apiGet(path);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error('Could not load attachments.');
  return response.json();
}
