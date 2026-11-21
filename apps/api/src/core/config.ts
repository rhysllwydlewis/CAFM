import type { Prisma, Tx } from '@cafm/db';
import { DEFAULT_SEQUENCES, formatNumber } from '@cafm/config-engine';
import type { AuthContext } from './session';

/**
 * Stores a configuration change as the next numbered version (doc 08 § Phase 0:
 * "every change stored as a version"), so it can be audited and rolled back.
 */
export async function recordVersion(
  tx: Tx,
  auth: AuthContext,
  kind: string,
  entityId: string,
  data: Prisma.InputJsonValue,
): Promise<number> {
  const tenantId = auth.membership!.tenantId;
  const last = await tx.configVersion.findFirst({
    where: { tenantId, kind, entityId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;
  await tx.configVersion.create({
    data: { tenantId, kind, entityId, version, data, createdByMembership: auth.membership!.id },
  });
  return version;
}

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
  const format = DEFAULT_SEQUENCES[key] ?? `${key.toUpperCase().slice(0, 4)}-{00000}`;
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
