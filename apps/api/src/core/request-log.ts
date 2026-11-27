import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** A caller-supplied request ID is kept only if it is short and plain, so it can't forge log lines. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export interface RequestLogLine {
  time: string;
  level: 'info' | 'warn' | 'error';
  msg: 'request';
  requestId: string;
  method: string;
  /** The matched route template (for example /api/invites/:token), never the real path, because tokens travel in path segments. */
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

/** The route pattern Express matched. Unmatched requests (404s) are logged as '(unmatched)' since their path is caller-supplied. */
function routeTemplate(req: Request): string {
  const route = (req.route as { path?: unknown } | undefined)?.path;
  return typeof route === 'string' ? `${req.baseUrl}${route}` : '(unmatched)';
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
        path: routeTemplate(req),
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
