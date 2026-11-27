import { NextResponse, type NextRequest } from 'next/server';
import { buildReportOnlyCsp } from '@/lib/csp';

// Gives every page its own script nonce and sends the full content security policy in report-only mode
// (doc 09, issue #122). Next.js reads the nonce from the request's policy header and stamps it on its own
// inline scripts. The enforced directives are in next.config.ts.
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = buildReportOnlyCsp(nonce);
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy-report-only', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy-report-only', policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api/|_next/static|_next/image|favicon.svg).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
