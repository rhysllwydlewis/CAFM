import { z } from 'zod';

/** The most changes one request to the mutation queue carries. */
export const MAX_MOBILE_MUTATIONS = 50;

const key = z.string().uuid();
const id = z.string().uuid();
const payload = z.record(z.string(), z.unknown());

/**
 * One change made on a phone. `key` is made on the phone before the change is sent and stays the same
 * on every retry. `payload` is what the website's endpoint for that change takes.
 */
export const mobileMutationItemSchema = z.discriminatedUnion('kind', [
  z.object({ key, kind: z.literal('status'), workOrderId: id, payload }).strict(),
  z.object({ key, kind: z.literal('note'), workOrderId: id, payload }).strict(),
  z
    .object({ key, kind: z.literal('checklist_answer'), workOrderId: id, checklistId: id, itemId: id, payload })
    .strict(),
  z.object({ key, kind: z.literal('meter_reading'), assetId: id, meterId: id, payload }).strict(),
]);
export type MobileMutationItem = z.infer<typeof mobileMutationItemSchema>;

export const mobileMutationsSchema = z
  .object({ mutations: z.array(mobileMutationItemSchema).min(1).max(MAX_MOBILE_MUTATIONS) })
  .strict();
