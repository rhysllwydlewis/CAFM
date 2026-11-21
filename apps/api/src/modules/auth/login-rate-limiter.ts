import { Injectable } from '@nestjs/common';

/**
 * Per-IP limit on failed sign-ins (doc 06). Per-account protection is the
 * lockout in AuthService. In memory, so each API instance counts on its own;
 * moves to Redis when the API runs on more than one instance.
 */
@Injectable()
export class LoginRateLimiter {
  private readonly max = Number(process.env.LOGIN_FAILURES_PER_IP ?? 30);
  private readonly windowMs = 15 * 60 * 1000;
  private readonly failures = new Map<string, number[]>();

  isBlocked(ip: string | undefined): boolean {
    return this.recent(ip ?? 'unknown').length >= this.max;
  }

  recordFailure(ip: string | undefined): void {
    const key = ip ?? 'unknown';
    this.failures.set(key, [...this.recent(key), Date.now()]);
    if (this.failures.size > 10_000) this.prune();
  }

  private recent(key: string): number[] {
    const since = Date.now() - this.windowMs;
    return (this.failures.get(key) ?? []).filter((t) => t > since);
  }

  private prune(): void {
    for (const key of this.failures.keys()) {
      const recent = this.recent(key);
      if (recent.length) this.failures.set(key, recent);
      else this.failures.delete(key);
    }
  }
}
