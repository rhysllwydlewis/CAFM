import { DEFAULT_SEQUENCES, formatNumber } from '@fmstead/config-engine';
import type { Tx } from './index';

/**
 * The next number in a sequence, e.g. WO-04801. Call inside the same
 * withTenant transaction that creates the record: the row lock taken by the
 * UPDATE makes numbers gap-free and unique under concurrency, and a rolled-back
 * transaction gives its number back.
 */
export async function nextNumber(
  tx: Tx,
  tenantId: string,
  key: string,
  context: Record<string, string> = {},
): Promise<string> {
  const format = Object.hasOwn(DEFAULT_SEQUENCES, key)
    ? DEFAULT_SEQUENCES[key]!
    : `${key.toUpperCase().slice(0, 4)}-{00000}`;
  await tx.$executeRaw`
    INSERT INTO number_sequence (id, tenant_id, key, format, next_value, updated_at)
    VALUES (gen_random_uuid(), ${tenantId}::uuid, ${key}, ${format}, 1, now())
    ON CONFLICT (tenant_id, key) DO NOTHING`;
  const [row] = await tx.$queryRaw<{ value: number; format: string }[]>`
    UPDATE number_sequence SET next_value = next_value + 1, updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND key = ${key}
    RETURNING next_value - 1 AS value, format`;
  return formatNumber(row!.format, row!.value, new Date(), context);
}
