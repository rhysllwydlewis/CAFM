import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { ASSET_ATTACHMENT_MEDIA_TYPES, ATTACHMENT_MAX_BYTES, PHOTO_MEDIA_TYPES } from '@cafm/shared';

export const uploadOptions = {
  // Browser multipart forms send unqualified filenames in UTF-8.
  defParamCharset: 'utf8',
  limits: { fileSize: ATTACHMENT_MAX_BYTES + 1, files: 1, fields: 0, parts: 2 },
};

export interface Upload {
  originalname: string;
  buffer: Buffer;
}

const signatures = [
  ['image/jpeg', (bytes: Buffer) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))],
  ['image/png', (bytes: Buffer) => bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))],
  [
    'image/webp',
    (bytes: Buffer) => bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP',
  ],
  ['application/pdf', (bytes: Buffer) => bytes.toString('latin1', 0, 5) === '%PDF-'],
] as const;

export function validateUpload(file: Upload | undefined, photosOnly: boolean) {
  if (!file?.buffer.length) throw new BadRequestException('Choose a file to upload.');
  const { buffer } = file;
  if (buffer.length > ATTACHMENT_MAX_BYTES) throw new PayloadTooLargeException('Choose a file up to 8 MB.');
  const mediaType = signatures.find(([, matches]) => matches(buffer))?.[0];
  const allowed: readonly string[] = photosOnly ? PHOTO_MEDIA_TYPES : ASSET_ATTACHMENT_MEDIA_TYPES;
  if (!mediaType || !allowed.includes(mediaType)) {
    throw new UnsupportedMediaTypeException(
      photosOnly ? 'Choose a JPEG, PNG or WebP photo.' : 'Choose an image or PDF.',
    );
  }
  const baseName = file.originalname.normalize('NFC').split(/[\\/]/).at(-1) ?? '';
  const filename = [...baseName.replace(/[\p{C}]/gu, '').trim()].slice(0, 150).join('') || 'attachment';
  return { buffer, filename, mediaType, byteLength: buffer.length };
}
