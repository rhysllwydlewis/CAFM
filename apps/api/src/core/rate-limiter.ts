/**
 * Sliding-window counter per key (an IP or an account). In memory, so each API
 * instance counts on its own; moves to Redis when the API runs on more than one instance.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  isBlocked(key: string | undefined): boolean {
    return this.recent(key ?? 'unknown').length >= this.max;
  }

  record(key: string | undefined): void {
    const k = key ?? 'unknown';
    this.hits.set(k, [...this.recent(k), Date.now()]);
    if (this.hits.size > 10_000) this.prune();
  }

  private recent(key: string): number[] {
    const since = Date.now() - this.windowMs;
    return (this.hits.get(key) ?? []).filter((t) => t > since);
  }

  private prune(): void {
    for (const key of this.hits.keys()) {
      const recent = this.recent(key);
      if (recent.length) this.hits.set(key, recent);
      else this.hits.delete(key);
    }
  }
}
