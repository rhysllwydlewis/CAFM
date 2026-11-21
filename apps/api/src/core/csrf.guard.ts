import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie sessions (doc 06). A cross-site page can only send
 * GET or POST without a CORS preflight (which we never allow), so POSTs must
 * be JSON, which a cross-site form can't send. PUT, PATCH and DELETE always
 * need a preflight. Any unsafe request with an Origin must also be this site:
 * the host the request was made to (forwarded by the web app's /api proxy),
 * or one listed in WEB_ORIGIN.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE.has(req.method)) return true;
    if (req.method === 'POST' && !req.is('application/json')) throw new ForbiddenException('Requests must be JSON');
    const origin = req.get('origin');
    if (origin && !this.allowed(origin, req)) throw new ForbiddenException('Origin not allowed');
    return true;
  }

  private allowed(origin: string, req: Request): boolean {
    const listed = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((o) => o.trim());
    if (listed.includes(origin)) return true;
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return false;
    }
    // Browsers can't forge Origin or X-Forwarded-Host on a cross-site request.
    const requestHost = (req.get('x-forwarded-host') ?? req.get('host') ?? '').split(',')[0]!.trim();
    return originHost === requestHost;
  }
}
