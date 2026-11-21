import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie sessions (doc 06). State-changing requests must be
 * JSON (a cross-site form can't send that without a CORS preflight, which we
 * never allow) and, when the browser sends an Origin, it must be ours.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE.has(req.method)) return true;
    if (!req.is('application/json')) throw new ForbiddenException('Requests must be JSON');
    const origin = req.get('origin');
    const allowed = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',');
    if (origin && !allowed.includes(origin)) throw new ForbiddenException('Origin not allowed');
    return true;
  }
}
