import { Injectable } from '@nestjs/common';
import { SlidingWindowLimiter } from '../../core/rate-limiter';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** Per-IP limit on failed sign-ins (doc 06). Per-account protection is the lockout in AuthService. */
@Injectable()
export class LoginRateLimiter {
  private readonly limiter = new SlidingWindowLimiter(Number(process.env.LOGIN_FAILURES_PER_IP ?? 30), FIFTEEN_MINUTES);

  isBlocked(ip: string | undefined): boolean {
    return this.limiter.isBlocked(ip);
  }

  recordFailure(ip: string | undefined): void {
    this.limiter.record(ip);
  }
}

/** Limits password reset requests per IP and per account (doc 06, issue #10). */
@Injectable()
export class ResetRateLimiter {
  readonly perIp = new SlidingWindowLimiter(Number(process.env.RESET_REQUESTS_PER_IP ?? 10), FIFTEEN_MINUTES);
  readonly perAccount = new SlidingWindowLimiter(3, FIFTEEN_MINUTES);
}
