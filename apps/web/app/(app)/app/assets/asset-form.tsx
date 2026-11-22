'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { FieldDefinition } from '@cafm/config-engine';
import { Button, Field, TextInput } from '@cafm/ui';
import {
  ASSET_CONDITIONS,
  ASSET_CRITICALITIES,
  ASSET_STATUSES,
  type AssetAttribute,
  type AssetClassRecord,
  type AssetRecord,
} from '@cafm/shared';
import { LocationCustomFields, readCustomFields } from '../locations/location-custom-fields';
import type { AssetDetail } from './asset-data';
import { Picker, type PickerOption } from './asset-picker';
import { CRITICALITY_LABELS, locationLabel, minorToPounds, poundsToMinor, route, STATUS_LABELS } from './asset-labels';
import styles from './assets.module.css';

const text = (data: FormData, name: string) => {
  const value = String(data.get(name) ?? '').trim();
  return value || null;
};

/** A class attribute's input, named so its value can be read back by key. */
function AttributeInput({ attribute, value }: { attribute: AssetAttribute; value: unknown }) {
  const id = 'attribute-' + attribute.key;
  const label = attribute.unit ? `${attribute.label} (${attribute.unit})` : attribute.label;
  const common = { id, name: id, required: attribute.required };
  if (attribute.type === 'picklist') {
    return (
      <Field label={label} htmlFor={id}>
        <select {...common} defaultValue={value == null ? '' : String(value)} className={styles.control}>
          <option value="">{attribute.required ? 'Choose…' : 'Not set'}</option>
          {attribute.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  if (attribute.type === 'checkbox') {
    return (
      <Field label={label} htmlFor={id}>
        <select
          {...common}
          defaultValue={value === true ? 'yes' : value === false ? 'no' : ''}
          className={styles.control}
        >
          <option value="">Not set</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </Field>
    );
  }
  return (
    <Field label={label} htmlFor={id}>
      <TextInput
        {...common}
        type={attribute.type === 'number' ? 'number' : attribute.type === 'date' ? 'date' : 'text'}
        step={attribute.type === 'number' ? 'any' : undefined}
        min={attribute.min}
        max={attribute.max}
        defaultValue={value == null ? '' : String(value)}
      />
    </Field>
  );
}

function readAttributes(template: AssetAttribute[], data: FormData) {
  return Object.fromEntries(
    template.map((attribute) => {
      const raw = String(data.get('attribute-' + attribute.key) ?? '').trim();
      let value: unknown = raw || null;
      if (attribute.type === 'number' && raw) value = Number(raw);
      else if (attribute.type === 'checkbox') value = raw === 'yes' ? true : raw === 'no' ? false : null;
      return [attribute.key, value];
    }),
  );
}

function errorText(result: { message?: string | string[]; errors?: Record<string, string> }) {
  if (result.errors) return Object.values(result.errors).join(' ');
  if (Array.isArray(result.message)) return result.message.join(' ');
  return result.message ?? 'Could not save this asset.';
}

export function AssetForm({
  asset,
  classes,
  customFields,
  parent,
  location,
}: {
  asset?: AssetDetail;
  classes: AssetClassRecord[];
  customFields: FieldDefinition[];
  /** A parent to start from when adding a component. */
  parent?: PickerOption | null;
  /** A location to start from when adding a component. */
  location?: PickerOption | null;
}) {
  const router = useRouter();
  const [classId, setClassId] = useState(asset?.classId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedClass = classes.find((item) => item.id === classId);
  const groups = [...new Set(classes.map((item) => item.group))];
  const cancelHref = asset ? `${route}/${asset.id}` : route;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const locationId = String(data.get('locationId') ?? '');
    if (!locationId) return setError('Choose a location.');
    const costText = String(data.get('cost') ?? '').trim();
    const minor = costText ? poundsToMinor(costText) : null;
    if (costText && minor === null) return setError('Enter the replacement cost in pounds, like 18500 or 18500.50.');
    const life = text(data, 'expectedLifeYears');
    const body = {
      name: text(data, 'name'),
      locationId,
      parentId: String(data.get('parentId') ?? '') || null,
      classId: classId || null,
      status: data.get('status'),
      criticality: data.get('criticality'),
      condition: text(data, 'condition'),
      make: text(data, 'make'),
      model: text(data, 'model'),
      serial: text(data, 'serial'),
      supplier: text(data, 'supplier'),
      installedOn: text(data, 'installedOn'),
      expectedLifeYears: life ? Number(life) : null,
      replacementCost:
        minor === null ? null : { amountMinor: minor, currency: asset?.replacementCost?.currency ?? 'GBP' },
      attributes: readAttributes(selectedClass?.attributes ?? [], data),
      ...(customFields.length ? { custom: readCustomFields(customFields, data) } : {}),
      ...(asset ? { version: asset.version } : {}),
    };
    setBusy(true);
    setError('');
    try {
      const response = await fetch(asset ? `/api/assets/${asset.id}` : '/api/assets', {
        method: asset ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as Parameters<typeof errorText>[0];
        setError(errorText(result));
        return;
      }
      const saved = (await response.json()) as AssetRecord;
      router.replace(`${route}/${saved.id}`);
      router.refresh();
    } catch {
      setError('Could not reach CAFM. Try saving again.');
    } finally {
      setBusy(false);
    }
  }

  const initialLocation =
    location ?? (asset ? { id: asset.locationId, label: locationLabel(asset.locationPath) } : null);
  const initialParent =
    parent ?? (asset?.parent ? { id: asset.parent.id, label: asset.parent.name, hint: asset.parent.number } : null);

  return (
    <section className="card">
      <header className="card-h">
        <h2 className="card-t">{asset ? 'Edit asset' : 'Add asset'}</h2>
      </header>
      <form className="card-b stack g4" onSubmit={submit}>
        {error && (
          <div className="callout danger" role="alert">
            {error}
          </div>
        )}
        <div className={styles.formGrid}>
          <Field label="Name" htmlFor="asset-name">
            <TextInput id="asset-name" name="name" defaultValue={asset?.name} required maxLength={160} />
          </Field>
          <Field label="Class" htmlFor="asset-class">
            <select
              id="asset-class"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className={styles.control}
            >
              <option value="">Not classified</option>
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {classes
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Picker
            name="locationId"
            label="Location"
            endpoint="/api/locations"
            initial={initialLocation}
            describe={(item) => ({ id: String(item.id), label: String(item.name), hint: String(item.code) })}
          />
          <Picker
            name="parentId"
            label="Part of (parent asset)"
            endpoint="/api/assets"
            initial={initialParent}
            describe={(item) => ({
              id: String(item.id),
              label: String(item.name),
              hint: String(item.number),
            })}
          />
          <Field label="Status" htmlFor="asset-status">
            <select
              id="asset-status"
              name="status"
              defaultValue={asset?.status ?? 'in_service'}
              className={styles.control}
            >
              {ASSET_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Criticality" htmlFor="asset-criticality">
            <select
              id="asset-criticality"
              name="criticality"
              defaultValue={asset?.criticality ?? 'medium'}
              className={styles.control}
            >
              {ASSET_CRITICALITIES.map((value) => (
                <option key={value} value={value}>
                  {CRITICALITY_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition" htmlFor="asset-condition">
            <select
              id="asset-condition"
              name="condition"
              defaultValue={asset?.condition ?? ''}
              className={styles.control}
            >
              <option value="">Not assessed</option>
              {ASSET_CONDITIONS.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier" htmlFor="asset-supplier">
            <TextInput id="asset-supplier" name="supplier" defaultValue={asset?.supplier ?? ''} maxLength={160} />
          </Field>
          <Field label="Make" htmlFor="asset-make">
            <TextInput id="asset-make" name="make" defaultValue={asset?.make ?? ''} maxLength={120} />
          </Field>
          <Field label="Model" htmlFor="asset-model">
            <TextInput id="asset-model" name="model" defaultValue={asset?.model ?? ''} maxLength={120} />
          </Field>
          <Field label="Serial number" htmlFor="asset-serial">
            <TextInput id="asset-serial" name="serial" defaultValue={asset?.serial ?? ''} maxLength={120} />
          </Field>
          <Field label="Installed on" htmlFor="asset-installed">
            <TextInput id="asset-installed" name="installedOn" type="date" defaultValue={asset?.installedOn ?? ''} />
          </Field>
          <Field label="Expected life (years)" htmlFor="asset-life">
            <TextInput
              id="asset-life"
              name="expectedLifeYears"
              type="number"
              min={1}
              max={200}
              step={1}
              defaultValue={asset?.expectedLifeYears ?? ''}
            />
          </Field>
          <Field label="Replacement cost (£)" htmlFor="asset-cost">
            <TextInput
              id="asset-cost"
              name="cost"
              inputMode="decimal"
              placeholder="18500.00"
              defaultValue={asset?.replacementCost ? minorToPounds(asset.replacementCost.amountMinor) : ''}
            />
          </Field>
        </div>
        {selectedClass && selectedClass.attributes.length > 0 && (
          <fieldset className="stack g3">
            <legend className="card-t">{selectedClass.name} details</legend>
            <div className={styles.formGrid} key={selectedClass.id}>
              {selectedClass.attributes.map((attribute) => (
                <AttributeInput
                  key={attribute.key}
                  attribute={attribute}
                  value={asset && asset.classId === selectedClass.id ? asset.attributes[attribute.key] : undefined}
                />
              ))}
            </div>
          </fieldset>
        )}
        <LocationCustomFields fields={customFields} values={asset?.custom} />
        <div className="row wrap g2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : asset ? 'Save changes' : 'Add asset'}
          </Button>
          <Link className="btn" href={cancelHref}>
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
