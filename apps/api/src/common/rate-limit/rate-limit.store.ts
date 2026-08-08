export const RATE_LIMIT_STORE = Symbol("RATE_LIMIT_STORE");

export type RateLimitResult = { count: number; resetAt: number };

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitResult>;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitResult>();

  constructor(private readonly now: () => number = Date.now) {}

  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const currentTime = this.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= currentTime) {
      const next = { count: 1, resetAt: currentTime + windowMs };
      this.buckets.set(key, next);
      return next;
    }
    const next = { count: current.count + 1, resetAt: current.resetAt };
    this.buckets.set(key, next);
    return next;
  }
}

export type RedisRateLimitMulti = {
  incr: (key: string) => RedisRateLimitMulti;
  pExpire: (key: string, milliseconds: number) => RedisRateLimitMulti;
  exec: () => Promise<unknown[]>;
};

export type RedisRateLimitClient = {
  multi: () => RedisRateLimitMulti;
};

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly client: RedisRateLimitClient) {}

  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const result = await this.client.multi().incr(key).pExpire(key, windowMs).exec();
    return { count: Number(result[0] as number), resetAt: Date.now() + windowMs };
  }
}
