import { describe, expect, it } from 'vitest';
import { fieldDefinitionInput, validateCustom, type FieldDefinition } from '../src';

const fields: FieldDefinition[] = [
  { key: 'contract_ref', label: 'Contract reference', type: 'text', required: true, maxLength: 12 },
  { key: 'notes', label: 'Notes', type: 'long_text', required: false },
  { key: 'floor_area', label: 'Floor area', type: 'number', required: false, min: 0, max: 100000 },
  { key: 'budget', label: 'Budget', type: 'currency', required: false },
  { key: 'installed_on', label: 'Installed on', type: 'date', required: false },
  { key: 'last_seen', label: 'Last seen', type: 'datetime', required: false },
  {
    key: 'risk',
    label: 'Risk',
    type: 'picklist',
    required: false,
    options: [
      { value: 'low', label: 'Low' },
      { value: 'high', label: 'High' },
    ],
  },
  {
    key: 'trades',
    label: 'Trades',
    type: 'multi_select',
    required: false,
    options: [
      { value: 'gas', label: 'Gas' },
      { value: 'elec', label: 'Electrical' },
    ],
  },
  { key: 'listed', label: 'Listed building', type: 'checkbox', required: false },
  { key: 'owner', label: 'Owner', type: 'user', required: false },
];

describe('custom field values', () => {
  it('accepts valid values of every type', () => {
    const result = validateCustom(fields, {
      contract_ref: 'C-1001',
      notes: 'Long note',
      floor_area: 1250.5,
      budget: { amount: 1250000, currency: 'GBP' },
      installed_on: '2024-03-01',
      last_seen: '2026-11-21T09:30:00Z',
      risk: 'high',
      trades: ['gas', 'elec'],
      listed: true,
      owner: '01a20007-68b4-7670-9699-ec9e1da6d889',
    });
    expect(result.success).toBe(true);
  });

  it('explains each problem in plain English, keyed by field', () => {
    const result = validateCustom(fields, {
      notes: 'x',
      floor_area: -1,
      budget: { amount: 12.5, currency: 'GBP' },
      installed_on: '01/03/2024',
      risk: 'medium',
      trades: ['plumbing'],
      owner: 'not-an-id',
      mystery: 1,
    });
    expect(result).toEqual({
      success: false,
      errors: {
        contract_ref: 'Enter Contract reference',
        floor_area: 'Floor area must be at least 0',
        budget: 'Budget must be a whole number of pence',
        installed_on: 'Installed on must be a date (YYYY-MM-DD)',
        risk: 'Choose one of the options for Risk',
        trades: 'Choose from the options for Trades',
        owner: 'Choose a valid record',
        mystery: 'This field doesn’t exist',
      },
    });
  });

  it('allows optional fields to be empty', () => {
    expect(validateCustom(fields, { contract_ref: 'C-1', notes: null })).toMatchObject({ success: true });
  });

  it('refuses dates that don’t exist', () => {
    expect(validateCustom(fields, { contract_ref: 'C-1', installed_on: '2028-02-29' }).success).toBe(true);
    expect(validateCustom(fields, { contract_ref: 'C-1', installed_on: '2026-02-31' })).toEqual({
      success: false,
      errors: { installed_on: 'Installed on must be a real date' },
    });
  });

  it('enforces text length', () => {
    expect(validateCustom(fields, { contract_ref: 'C-123456789012345' }).success).toBe(false);
  });
});

describe('field definitions', () => {
  it('requires options for pick lists, and only for pick lists', () => {
    expect(
      fieldDefinitionInput.safeParse({ entityType: 'asset', key: 'risk', label: 'Risk', type: 'picklist' }).success,
    ).toBe(false);
    expect(
      fieldDefinitionInput.safeParse({
        entityType: 'asset',
        key: 'note',
        label: 'Note',
        type: 'text',
        options: [{ value: 'a', label: 'A' }],
      }).success,
    ).toBe(false);
  });

  it('rejects bad keys and duplicate options', () => {
    expect(
      fieldDefinitionInput.safeParse({ entityType: 'asset', key: 'Bad Key', label: 'X', type: 'text' }).success,
    ).toBe(false);
    expect(
      fieldDefinitionInput.safeParse({
        entityType: 'asset',
        key: 'risk',
        label: 'Risk',
        type: 'picklist',
        options: [
          { value: 'a', label: 'A' },
          { value: 'a', label: 'B' },
        ],
      }).success,
    ).toBe(false);
  });
});
