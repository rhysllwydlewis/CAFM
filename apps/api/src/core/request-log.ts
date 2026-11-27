import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** A caller-supplied request ID is kept only if it is short and plain, so it can't forge log lines. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Routes that carry a secret link token as a path segment: the token is replaced so it never reaches the logs. */
const TOKEN_PATHS = /^(\/api\/(?:auth\/password-reset|auth\/invites|contractor-jobs)\/)[^/]+/;

/** The path without its query string and without any link token. */
export function loggedPath(originalUrl: string): string {
  return (originalUrl.split('?')[0] ?? '').replace(TOKEN_PATHS, '$1:token');
}

export interface RequestLogLine {
  time: string;
  level: 'info' | 'warn' | 'error';
  msg: 'request';
  requestId: string;
  method: string;
  /** The path only. The query string is left out and link tokens in the path are replaced with `:token`. */
  path: string;
  status: number;
  durationMs: number;
  tenantId: string | null;
  membershipId: string | null;
}

/** Whether to write request lines. Off under test so the suites stay quiet; LOG_REQUESTS=true or false overrides. */
export function requestLogEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.LOG_REQUESTS === 'true') return true;
  if (env.LOG_REQUESTS === 'false') return false;
  return env.NODE_ENV !== 'test' && !env.VITEST;
}

/**
 * Gives every request an ID (the caller's x-request-id when it is plain, otherwise a new one), returns it in the
 * x-request-id response header, and writes one JSON line per finished request with the tenant and membership
 * the session resolved to. No bodies, query strings, cookies or headers are logged.
 */
export function requestLogger(write: (line: string) => void = (line) => console.log(line)) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const supplied = req.header('x-request-id');
    const requestId = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
    res.setHeader('x-request-id', requestId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const status = res.statusCode;
      const line: RequestLogLine = {
        time: new Date().toISOString(),
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        msg: 'request',
        requestId,
        method: req.method,
        path: loggedPath(req.originalUrl),
        status,
        durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
        tenantId: req.auth?.membership?.tenantId ?? null,
        membershipId: req.auth?.membership?.id ?? null,
      };
      write(JSON.stringify(line));
    });
    next();
  };
}
