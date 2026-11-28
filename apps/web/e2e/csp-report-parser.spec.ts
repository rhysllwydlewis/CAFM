import { expect, test } from '@playwright/test';
import { MAX_REPORT_BYTES, originOnly, parseCspReports } from '../lib/csp-report';

// Pure parser tests: no browser or server needed (the endpoint itself is covered in security-policy.spec.ts).

const legacy = (body: Record<string, unknown>) => JSON.stringify({ 'csp-report': body });

test('a legacy report keeps the directive, origins and disposition, and never a path or query string', () => {
  const out = parseCspReports(
    legacy({
      'document-uri': 'https://example.test/login?token=secret#frag',
      'blocked-uri': 'https://cdn.example.test/x.js?k=1',
      'effective-directive': 'script-src-elem',
      disposition: 'report',
    }),
  );
  expect(out).toEqual([
    {
      directive: 'script-src-elem',
      blocked: 'https://cdn.example.test',
      document: 'https://example.test',
      disposition: 'report',
    },
  ]);
  expect(JSON.stringify(out)).not.toContain('secret');
});

test('a Reporting API list is read, and at most 10 entries are kept', () => {
  const entry = {
    type: 'csp-violation',
    body: {
      effectiveDirective: 'img-src',
      blockedURL: 'inline',
      documentURL: 'https://example.test/a',
      disposition: 'enforce',
    },
  };
  const out = parseCspReports(JSON.stringify(Array.from({ length: 25 }, () => entry)));
  expect(out).toHaveLength(10);
  expect(out[0]).toEqual({
    directive: 'img-src',
    blocked: 'inline',
    document: 'https://example.test',
    disposition: 'enforce',
  });
});

test('anything that is not a report gives an empty list', () => {
  for (const raw of [
    'not json',
    '',
    'null',
    '42',
    '"text"',
    '[]',
    '{}',
    legacy({}),
    legacy({ 'blocked-uri': 'inline' }),
    JSON.stringify([{ type: 'network-error', body: { effectiveDirective: 'img-src' } }]),
    JSON.stringify([null, 1, 'x', ['y']]),
  ]) {
    expect(parseCspReports(raw)).toEqual([]);
  }
});

test('a body over the size limit is ignored', () => {
  const big = legacy({ 'effective-directive': 'img-src', pad: 'x'.repeat(MAX_REPORT_BYTES) });
  expect(parseCspReports(big)).toEqual([]);
});

test('fields are cut short and an unknown disposition is labelled unknown', () => {
  const [v] = parseCspReports(legacy({ 'effective-directive': 'a'.repeat(500), disposition: 'weird\nvalue' }));
  expect(v?.directive).toHaveLength(64);
  expect(v?.disposition).toBe('unknown');
});

test('non-string fields are dropped rather than logged', () => {
  expect(parseCspReports(legacy({ 'effective-directive': { x: 1 } }))).toEqual([]);
  const [v] = parseCspReports(legacy({ 'effective-directive': 'img-src', 'blocked-uri': { x: 1 }, 'document-uri': 7 }));
  expect(v).toMatchObject({ blocked: '', document: '' });
});

test('addresses are reduced to an origin; keywords pass; junk becomes unknown', () => {
  expect(originOnly('https://a.test:8443/p?q=1')).toBe('https://a.test:8443');
  expect(originOnly('inline')).toBe('inline');
  expect(originOnly('eval')).toBe('eval');
  expect(originOnly('data:text/html;base64,AAAA')).toBe('data:');
  expect(originOnly('not a url with spaces')).toBe('unknown');
  expect(originOnly('')).toBe('');
  expect(originOnly(undefined)).toBe('');
});
