import { z } from 'zod';

export const ASSET_TAG_KINDS = ['qr', 'barcode', 'nfc'] as const;
export type AssetTagKind = (typeof ASSET_TAG_KINDS)[number];
export const assetTagCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{0,23}$/, {
    message: 'Use up to 24 letters, digits or hyphens for the tag code.',
  });
export const createAssetTagSchema = z.object({ kind: z.enum(ASSET_TAG_KINDS), code: assetTagCodeSchema });
export const assetScanSchema = z.union([z.object({ id: z.string().uuid() }), z.object({ code: assetTagCodeSchema })]);

const meterValue = z
  .string()
  .trim()
  .regex(/^\d{1,12}(?:\.\d{1,6})?$/, {
    message: 'Enter a non-negative value with up to 12 whole digits and six decimal places.',
  });
export const createAssetMeterSchema = z.object({
  name: z.string().trim().min(1).max(100),
  unit: z.string().trim().min(1).max(24),
  rolloverAt: meterValue
    .refine((value) => Number(value) > 0, 'The rollover limit must be greater than zero.')
    .nullable(),
});
export const recordMeterReadingSchema = z.object({
  value: meterValue,
  recordedAt: z.string().datetime({ offset: true }).optional(),
  rolledOver: z.boolean(),
  submission: z.string().uuid(),
});

export const saveWarrantySchema = z.object({
  provider: z.string().trim().min(1).max(120),
  reference: z.string().trim().min(1).max(100),
  startsOn: z.string().date(),
  expiresOn: z.string().date(),
  noticeDays: z.number().int().min(0).max(365),
  notes: z.string().trim().max(2000).nullable(),
  active: z.boolean(),
});
export const updateWarrantySchema = saveWarrantySchema.extend({ version: z.number().int().positive().max(2147483646) });

export interface AssetTagItem {
  id: string;
  kind: AssetTagKind;
  code: string;
  active: boolean;
}

export interface PrintableAssetTag extends AssetTagItem {
  asset: { id: string; name: string; number: string };
}

export interface AssetScan {
  assetId: string;
  destination: 'report' | 'register';
}

export interface AssetMeterReadingItem {
  id: string;
  recordedAt: string;
  value: string;
  total: string;
  rolledOver: boolean;
}

export interface AssetMeterItem {
  id: string;
  name: string;
  unit: string;
  rolloverAt: string | null;
  readings: AssetMeterReadingItem[];
  hasMoreReadings: boolean;
}

export const WARRANTY_CLAIM_STATUSES = ['submitted', 'accepted', 'rejected', 'closed'] as const;
export type WarrantyClaimStatus = (typeof WARRANTY_CLAIM_STATUSES)[number];
export const saveWarrantyClaimSchema = z.object({
  reference: z.string().trim().min(1).max(100),
  status: z.enum(WARRANTY_CLAIM_STATUSES),
  filedOn: z.string().date(),
  notes: z.string().trim().max(1000).nullable(),
});
export const updateWarrantyClaimSchema = saveWarrantyClaimSchema.extend({
  version: z.number().int().positive().max(2147483646),
});

export interface WarrantyClaimItem extends z.infer<typeof saveWarrantyClaimSchema> {
  id: string;
  version: number;
}

export type WarrantyInput = z.infer<typeof saveWarrantySchema>;
export interface AssetWarrantyItem extends WarrantyInput {
  id: string;
  version: number;
  claims: WarrantyClaimItem[];
}

export interface AssetOperations {
  tags: AssetTagItem[];
  meters: AssetMeterItem[];
  warranties: AssetWarrantyItem[];
}

export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
export const ATTACHMENT_LIMIT = 20;
export const PHOTO_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ASSET_ATTACHMENT_MEDIA_TYPES = [...PHOTO_MEDIA_TYPES, 'application/pdf'] as const;

export interface AttachmentItem {
  id: string;
  filename: string;
  mediaType: string;
  byteLength: number;
  createdAt: string;
}
