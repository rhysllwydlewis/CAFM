import { UnprocessableEntityException } from '@nestjs/common';
import type { Prisma, Tx } from '@cafm/db';
import { validateCustom, type FieldDefinition } from '@cafm/config-engine';
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

export { nextNumber } from '@cafm/db';

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
