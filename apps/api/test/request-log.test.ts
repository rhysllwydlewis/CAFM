import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { requestLogEnabled, requestLogger, type RequestLogLine } from '../src/core/request-log';

function run(headers: Record<string, string>, url: string, auth: unknown, status: number, route?: string) {
  const lines: string[] = [];
  const res = Object.assign(new EventEmitter(), {
    statusCode: status,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
  });
  const req = {
    method: 'GET',
    originalUrl: url,
    baseUrl: '',
    route: route ? { path: route } : undefined,
    auth,
    header: (k: string) => headers[k.toLowerCase()],
  } as unknown as Request;
  requestLogger((l) => lines.push(l))(req, res as unknown as Response, () => undefined);
  res.emit('finish');
  return { res, line: JSON.parse(lines[0]!) as RequestLogLine };
}

describe('request log', () => {
  it('logs the request ID, tenant and membership, and leaves the query string out', () => {
    const { res, line } = run(
      { 'x-request-id': 'abc12345-trace' },
      '/api/work-orders?token=secret',
      { membership: { tenantId: 't1', id: 'm1' } },
      200,
      '/api/work-orders',
    );
    expect(line).toMatchObject({
      requestId: 'abc12345-trace',
      path: '/api/work-orders',
      tenantId: 't1',
      membershipId: 'm1',
      status: 200,
      level: 'info',
    });
    expect(res.headers['x-request-id']).toBe('abc12345-trace');
    expect(JSON.stringify(line)).not.toContain('secret');
  });

  it('logs the route template, not a token in the path', () => {
    const { line } = run(
      {},
      '/api/auth/password-reset/s3cr3t-token-value',
      undefined,
      200,
      '/api/auth/password-reset/:token',
    );
    expect(line.path).toBe('/api/auth/password-reset/:token');
    expect(JSON.stringify(line)).not.toContain('s3cr3t');
    expect(run({}, '/api/nope/s3cr3t', undefined, 404).line.path).toBe('(unmatched)');
  });

  it('replaces an unsafe caller ID and marks errors', () => {
    const { res, line } = run({ 'x-request-id': 'bad id\nforged' }, '/api/health', undefined, 500);
    expect(line.requestId).not.toContain('forged');
    expect(res.headers['x-request-id']).toBe(line.requestId);
    expect(line).toMatchObject({ tenantId: null, level: 'error' });
  });

  it('is off under test unless switched on', () => {
    expect(requestLogEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(requestLogEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(requestLogEnabled({ NODE_ENV: 'test', LOG_REQUESTS: 'true' })).toBe(true);
  });
});

describe('request log in the real app', () => {
  it('never writes a token from a path segment', async () => {
    const { startApp } = await import('./helpers');
    const { default: request } = await import('supertest');
    const { vi } = await import('vitest');
    process.env.LOG_REQUESTS = 'true';
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const app = await startApp();
      await request(app.getHttpServer()).get('/api/auth/invites/s3cr3t-invite-token');
      await request(app.getHttpServer()).get('/api/contractor-jobs/s3cr3t-job-token');
      await app.close();
      const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(output).toContain('"msg":"request"');
      expect(output).not.toContain('s3cr3t');
      expect(output).toContain('/api/auth/invites/:token');
    } finally {
      spy.mockRestore();
      delete process.env.LOG_REQUESTS;
    }
  });
});
