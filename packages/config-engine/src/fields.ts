import { z } from 'zod';

/**
 * Custom fields (doc 02 § 0, ADR 0003): definitions live in field_definition,
 * values in each entity's `custom` JSONB column, and the same generated zod
 * schema validates them in the API, the web app and mobile.
 */

export const ENTITY_TYPES = [
  'request',
  'work_order',
  'asset',
  'location',
  'ppm_schedule',
  'contractor',
  'person',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const FIELD_TYPES = [
  'text',
  'long_text',
  'number',
  'currency',
  'date',
  'datetime',
  'picklist',
  'multi_select',
  'checkbox',
  'user',
  'location',
  'asset',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Short text',
  long_text: 'Long text',
  number: 'Number',
  currency: 'Money',
  date: 'Date',
  datetime: 'Date and time',
  picklist: 'Pick one',
  multi_select: 'Pick several',
  checkbox: 'Yes or no',
  user: 'Person',
  location: 'Location',
  asset: 'Asset',
};

const optionSchema = z.object({ value: z.string().trim().min(1).max(64), label: z.string().trim().min(1).max(120) });

/** What an administrator sends to create or change a field. */
export const fieldDefinitionInput = z
  .object({
    entityType: z.enum(ENTITY_TYPES),
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,47}$/, 'Use lowercase letters, numbers and underscores, starting with a letter'),
    label: z.string().trim().min(1, 'Enter a label').max(80),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    helpText: z.string().trim().max(300).optional(),
    options: z.array(optionSchema).max(200).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    maxLength: z.number().int().positive().max(10000).optional(),
  })
  .superRefine((f, ctx) => {
    const needsOptions = f.type === 'picklist' || f.type === 'multi_select';
    if (needsOptions && (!f.options || f.options.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Add at least one option' });
    }
    if (!needsOptions && f.options?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Only pick lists have options' });
    }
    if (f.options && new Set(f.options.map((o) => o.value)).size !== f.options.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Option values must be unique' });
    }
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['min'], message: 'The minimum is more than the maximum' });
    }
  });
export type FieldDefinitionInput = z.infer<typeof fieldDefinitionInput>;

/** A stored definition, as the validator needs it. */
export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: { value: string; label: string }[] | null;
  min?: number | null;
  max?: number | null;
  maxLength?: number | null;
}

const uuid = () => z.string().uuid('Choose a valid record');

function valueSchema(f: FieldDefinition): z.ZodTypeAny {
  switch (f.type) {
    case 'text':
      return z
        .string()
        .trim()
        .max(f.maxLength ?? 255);
    case 'long_text':
      return z.string().max(f.maxLength ?? 10000);
    case 'number': {
      let s = z.number({ invalid_type_error: `${f.label} must be a number` }).finite();
      if (f.min != null) s = s.min(f.min, `${f.label} must be at least ${f.min}`);
      if (f.max != null) s = s.max(f.max, `${f.label} must be at most ${f.max}`);
      return s;
    }
    case 'currency':
      // Money is integer minor units plus a currency code, never floats (CLAUDE.md).
      return z.object({
        amount: z.number().int(`${f.label} must be a whole number of pence`),
        currency: z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code'),
      });
    case 'date':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${f.label} must be a date (YYYY-MM-DD)`);
    case 'datetime':
      // Stored in UTC (CLAUDE.md).
      return z.string().datetime({ message: `${f.label} must be a date and time in UTC` });
    case 'picklist': {
      const values = (f.options ?? []).map((o) => o.value);
      return z.string().refine((v) => values.includes(v), `Choose one of the options for ${f.label}`);
    }
    case 'multi_select': {
      const values = (f.options ?? []).map((o) => o.value);
      return z
        .array(z.string())
        .refine((v) => v.every((x) => values.includes(x)), `Choose from the options for ${f.label}`);
    }
    case 'checkbox':
      return z.boolean();
    case 'user':
    case 'location':
    case 'asset':
      return uuid();
  }
}

/** The zod schema for an entity's `custom` object, from its active field definitions. */
export function buildCustomSchema(fields: readonly FieldDefinition[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    const s = valueSchema(f);
    shape[f.key] = f.required ? s : s.nullable().optional();
  }
  // Unknown keys are rejected so stale or mistyped fields can't creep into the data.
  return z.object(shape).strict();
}

export type CustomValidation =
  { success: true; data: Record<string, unknown> } | { success: false; errors: Record<string, string> };

/** Validates custom field values; errors are keyed by field, with plain-English messages. */
export function validateCustom(fields: readonly FieldDefinition[], values: unknown): CustomValidation {
  const result = buildCustomSchema(fields).safeParse(values ?? {});
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (issue.code === 'unrecognized_keys') {
      for (const k of issue.keys) errors[k] = 'This field doesn’t exist';
      continue;
    }
    if (errors[key]) continue;
    const label = fields.find((f) => f.key === key)?.label ?? key;
    errors[key] = issue.code === 'invalid_type' && issue.received === 'undefined' ? `Enter ${label}` : issue.message;
  }
  return { success: false, errors };
}
