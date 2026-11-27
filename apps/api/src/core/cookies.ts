import type { Request, Response } from 'express';
import { SESSION_COOKIE } from './session';

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  persistent: boolean;
}

export function sessionToken(req: Request): string | undefined {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof token === 'string' && token ? token : undefined;
}

export function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' };
}

export function setSessionCookie(res: Response, s: IssuedSession): void {
  res.cookie(SESSION_COOKIE, s.token, {
    ...cookieOptions(),
    // Without "Keep me signed in" the cookie ends with the browser; the server still expires it after 12 hours.
    ...(s.persistent ? { expires: s.expiresAt } : {}),
  });
}

export function clientInfo(req: Request): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

/** The short-lived cookie that carries a pending second sign-in step. It never grants access on its own. */
export const MFA_COOKIE = 'fmstead_mfa';

export function mfaChallengeToken(req: Request): string | undefined {
  const token: unknown = req.cookies?.[MFA_COOKIE];
  return typeof token === 'string' && token ? token : undefined;
}

export function setMfaCookie(res: Response, c: { token: string; expiresAt: Date }): void {
  res.cookie(MFA_COOKIE, c.token, { ...cookieOptions(), expires: c.expiresAt });
}
