import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { loggedPath, requestLogEnabled, requestLogger, type RequestLogLine } from '../src/core/request-log';

function run(headers: Record<string, string>, url: string, auth: unknown, status: number) {
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

  it('replaces an unsafe caller ID and marks errors', () => {
    const { res, line } = run({ 'x-request-id': 'bad id\nforged' }, '/api/health', undefined, 500);
    expect(line.requestId).not.toContain('forged');
    expect(res.headers['x-request-id']).toBe(line.requestId);
    expect(line).toMatchObject({ tenantId: null, level: 'error' });
  });

  it('keeps link tokens out of the logged path', () => {
    expect(loggedPath('/api/auth/password-reset/abc123secret')).toBe('/api/auth/password-reset/:token');
    expect(loggedPath('/api/auth/invites/abc123secret/accept')).toBe('/api/auth/invites/:token/accept');
    expect(loggedPath('/api/contractor-jobs/abc123secret/status?x=1')).toBe('/api/contractor-jobs/:token/status');
    expect(loggedPath('/api/work-orders/wo1')).toBe('/api/work-orders/wo1');
  });

  it('is off under test unless switched on', () => {
    expect(requestLogEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(requestLogEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(requestLogEnabled({ NODE_ENV: 'test', LOG_REQUESTS: 'true' })).toBe(true);
  });
});
