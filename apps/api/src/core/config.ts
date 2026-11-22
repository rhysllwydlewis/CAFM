import { UnprocessableEntityException } from '@nestjs/common';
import type { Prisma, Tx } from '@cafm/db';
import { DEFAULT_SEQUENCES, formatNumber, validateCustom, type FieldDefinition } from '@cafm/config-engine';
import type { AuthContext } from './session';

/** The definition as the validator and clients need it. */
export function toFieldDefinition(row: Prisma.FieldDefinitionGetPayload<object>): FieldDefinition & {
  id: string;
  entityType: string;
  helpText: string | null;
  position: number;
  active: boolean;
} {
  return {
    id: row.id,
    entityType: row.entityType,
    key: row.key,
    label: row.label,
    type: row.type as FieldDefinition['type'],
    required: row.required,
    helpText: row.helpText,
    options: (row.options as FieldDefinition['options']) ?? null,
    min: row.min,
    max: row.max,
    maxLength: row.maxLength,
    position: row.position,
    active: row.active,
  };
}

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

/** The active custom fields for an entity type, by key (doc 02 § 0). */
export async function activeCustomFields(
  tx: Tx,
  tenantId: string,
  entityType: string,
): Promise<ReadonlyMap<string, FieldDefinition>> {
  const rows = await tx.fieldDefinition.findMany({
    where: { tenantId, entityType, active: true },
    orderBy: [{ position: 'asc' }, { label: 'asc' }],
  });
  return new Map(rows.map((row) => [row.key, toFieldDefinition(row)]));
}

/** The stored values for fields that are still active. Retired fields stay in storage but are hidden. */
export function visibleCustom(values: Prisma.JsonValue | undefined, fields: ReadonlyMap<string, FieldDefinition>) {
  return Object.fromEntries(Object.entries((values ?? {}) as Prisma.JsonObject).filter(([key]) => fields.has(key)));
}

/**
 * Validates custom values against the active fields and merges them over the
 * previous ones, keeping values for retired fields. Throws 422 with a message per field.
 */
export function mergeCustom(
  fields: ReadonlyMap<string, FieldDefinition>,
  values: Record<string, unknown>,
  previous?: Prisma.JsonValue,
): Prisma.InputJsonObject {
  const result = validateCustom([...fields.values()], { ...visibleCustom(previous, fields), ...values });
  if (!result.success) throw new UnprocessableEntityException({ code: 'invalid_custom_fields', errors: result.errors });
  const retired = Object.fromEntries(
    Object.entries((previous ?? {}) as Prisma.JsonObject).filter(([key]) => !fields.has(key)),
  );
  return { ...retired, ...result.data } as Prisma.InputJsonObject;
}
