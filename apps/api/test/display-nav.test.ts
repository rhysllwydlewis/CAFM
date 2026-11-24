import { describe, expect, it } from 'vitest';
import { MODULES, applyDisplay, termLabel, type DisplaySettings } from '@cafm/shared';

const items = [
  { key: 'home', label: 'Home' },
  { key: 'helpdesk', label: 'Helpdesk' },
  { key: 'work-orders', label: 'Work orders' },
  { key: 'locations', label: 'Locations' },
  { key: 'admin', label: 'Administration' },
];
const display = (d: Partial<DisplaySettings>): DisplaySettings => ({ modules: [], terms: [], ...d });

describe('applyDisplay', () => {
  it('changes nothing without choices', () => {
    expect(applyDisplay(items, display({}))).toEqual(items);
    expect(applyDisplay(items, undefined)).toEqual(items);
  });

  it('drops modules switched off, but never Home, My requests or Administration', () => {
    const off = (key: string) => ({ key, enabled: false, label: null, position: null });
    const out = applyDisplay(items, display({ modules: [off('helpdesk'), off('home'), off('admin')] }));
    expect(out.map((i) => i.key)).toEqual(['home', 'work-orders', 'locations', 'admin']);
  });

  it('uses the organisation’s own name for a module before its word for the term', () => {
    const out = applyDisplay(
      items,
      display({
        modules: [{ key: 'work-orders', enabled: true, label: 'Tasks', position: null }],
        terms: [
          { key: 'work_order', singular: 'Job', plural: 'Jobs' },
          { key: 'site', singular: 'School', plural: 'Schools' },
        ],
      }),
    );
    expect(out.find((i) => i.key === 'work-orders')?.label).toBe('Tasks');
    expect(out.find((i) => i.key === 'locations')?.label).toBe('Schools');
  });

  it('places positioned modules where asked and clamps a position past the end', () => {
    const pos = (key: string, position: number) => ({ key, enabled: true, label: null, position });
    const out = applyDisplay(items, display({ modules: [pos('locations', 1), pos('home', 99)] }));
    expect(out.map((i) => i.key)).toEqual(['locations', 'helpdesk', 'work-orders', 'admin', 'home']);
  });
});

describe('termLabel', () => {
  it('uses the standard word unless the organisation has its own', () => {
    expect(termLabel(undefined, 'site')).toBe('Site');
    expect(termLabel(undefined, 'site', true)).toBe('Sites');
    expect(termLabel(display({ terms: [{ key: 'site', singular: 'School', plural: 'Schools' }] }), 'site', true)).toBe(
      'Schools',
    );
  });
});

it('lists each module once', () => {
  expect(new Set(MODULES.map((m) => m.key)).size).toBe(MODULES.length);
});
