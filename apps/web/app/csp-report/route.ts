import { NextResponse } from 'next/server';
import { MAX_REPORT_BYTES, parseCspReports } from '@/lib/csp-report';

// Collects content security policy violation reports from browsers (doc 09, issue #122). Browsers send these
// without cookies or a CSRF token, so the route has no session and does nothing but write one log line per
// violation. It stores nothing and returns no data. A small per-instance cap stops a flood filling the logs.

export const dynamic = 'force-dynamic';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
let windowStart = 0;
let count = 0;

function allowed(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    count = 0;
  }
  count += 1;
  return count <= MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_REPORT_BYTES) return new NextResponse(null, { status: 413 });
  if (!allowed()) return new NextResponse(null, { status: 429 });
  const body = (await request.text()).slice(0, MAX_REPORT_BYTES + 1);
  for (const violation of parseCspReports(body)) {
    console.log(JSON.stringify({ time: new Date().toISOString(), level: 'warn', msg: 'csp-violation', ...violation }));
  }
  return new NextResponse(null, { status: 204 });
}
