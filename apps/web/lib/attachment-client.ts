import { ASSET_ATTACHMENT_MEDIA_TYPES, ATTACHMENT_MAX_BYTES, PHOTO_MEDIA_TYPES } from '@cafm/shared';

export async function uploadFile(path: string, file: File, photosOnly: boolean) {
  const types: readonly string[] = photosOnly ? PHOTO_MEDIA_TYPES : ASSET_ATTACHMENT_MEDIA_TYPES;
  if (!file.size || file.size > ATTACHMENT_MAX_BYTES) throw new Error('Choose a file up to 8 MB.');
  if (file.type && !types.includes(file.type)) {
    throw new Error(photosOnly ? 'Choose a JPEG, PNG or WebP photo.' : 'Choose an image or PDF.');
  }
  const form = new FormData();
  form.set('file', file);
  const response = await fetch('/api' + path, { method: 'PUT', body: form });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.message === 'string' ? error.message : 'Could not upload the file. Try again.');
  }
}
