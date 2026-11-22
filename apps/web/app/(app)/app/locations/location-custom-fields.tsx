import { Field, TextInput } from '@cafm/ui';
import type { FieldDefinition } from '@cafm/config-engine';
import styles from './locations.module.css';

const fieldName = (field: FieldDefinition) => 'custom-' + field.key;
const isCurrency = (value: unknown): value is { amount: number; currency: string } =>
  typeof value === 'object' &&
  value !== null &&
  'amount' in value &&
  'currency' in value &&
  typeof value.amount === 'number' &&
  typeof value.currency === 'string';

export function customFieldValue(field: FieldDefinition, value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const option = (item: unknown) => field.options?.find((entry) => entry.value === item)?.label ?? String(item);
  if (Array.isArray(value)) return value.map(option).join(', ');
  if (isCurrency(value)) {
    const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: value.currency });
    return formatter.format(value.amount / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2));
  }
  return option(value);
}

export function readCustomFields(fields: FieldDefinition[], data: FormData) {
  return Object.fromEntries(
    fields.map((field) => {
      const name = fieldName(field);
      const raw = String(data.get(name) ?? '');
      let value: unknown = raw || null;
      if (field.type === 'currency') {
        const amount = data.get(name + '-amount');
        const currency = data.get(name + '-currency');
        value =
          amount || currency
            ? { amount: amount ? Number(amount) : null, currency: String(currency).toUpperCase() }
            : null;
      } else if (field.type === 'multi_select') value = data.getAll(name);
      else if (field.type === 'number' && raw) value = Number(raw);
      else if (field.type === 'checkbox' && raw) value = raw === 'yes';
      else if (field.type === 'datetime' && raw) value = new Date(raw + 'Z').toISOString();
      return [field.key, value];
    }),
  );
}

export function LocationCustomFields({
  fields,
  values,
}: {
  fields: FieldDefinition[];
  values?: Record<string, unknown>;
}) {
  if (!fields.length) return null;
  return (
    <fieldset className={styles.calendarGroup}>
      <legend>Additional fields</legend>
      <div className={styles.formGrid}>
        {fields.map((field) => {
          const id = fieldName(field);
          const value = values?.[field.key];
          const common = { id, name: id, required: field.required };
          if (field.type === 'currency') {
            return (
              <div className="stack g2" key={field.key} role="group" aria-label={field.label}>
                <Field label="Amount in minor units" htmlFor={id + '-amount'}>
                  <TextInput
                    id={id + '-amount'}
                    name={id + '-amount'}
                    type="number"
                    step={1}
                    defaultValue={isCurrency(value) ? value.amount : undefined}
                    required={field.required}
                  />
                </Field>
                <Field label="Currency code" htmlFor={id + '-currency'}>
                  <TextInput
                    id={id + '-currency'}
                    name={id + '-currency'}
                    maxLength={3}
                    pattern="[A-Za-z]{3}"
                    placeholder="GBP"
                    defaultValue={isCurrency(value) ? value.currency : undefined}
                    required={field.required}
                  />
                </Field>
              </div>
            );
          }
          let control;
          if (field.type === 'picklist' || field.type === 'multi_select' || field.type === 'checkbox') {
            const multiple = field.type === 'multi_select';
            const options =
              field.type === 'checkbox'
                ? [
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                  ]
                : (field.options ?? []);
            control = (
              <select
                {...common}
                className={styles.control}
                multiple={multiple}
                defaultValue={
                  multiple
                    ? Array.isArray(value)
                      ? value.map(String)
                      : []
                    : typeof value === 'boolean'
                      ? value
                        ? 'yes'
                        : 'no'
                      : String(value ?? '')
                }
              >
                {!multiple && <option value="">Choose an option</option>}
                {options.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            );
          } else if (field.type === 'long_text') {
            control = (
              <textarea
                {...common}
                className={styles.control}
                maxLength={field.maxLength ?? 10000}
                defaultValue={String(value ?? '')}
              />
            );
          } else {
            const type =
              field.type === 'number' || field.type === 'date'
                ? field.type
                : field.type === 'datetime'
                  ? 'datetime-local'
                  : 'text';
            const initial = String(value ?? '');
            control = (
              <TextInput
                {...common}
                type={type}
                defaultValue={field.type === 'datetime' ? initial.replace(/Z$/, '') : initial}
                step={['number', 'datetime'].includes(field.type) ? 'any' : undefined}
                min={field.min ?? undefined}
                max={field.max ?? undefined}
                maxLength={field.type === 'text' ? (field.maxLength ?? 255) : undefined}
                placeholder={['user', 'location', 'asset'].includes(field.type) ? 'Record ID' : undefined}
              />
            );
          }
          return (
            <Field key={field.key} label={field.label + (field.type === 'datetime' ? ' (UTC)' : '')} htmlFor={id}>
              {control}
            </Field>
          );
        })}
      </div>
    </fieldset>
  );
}
