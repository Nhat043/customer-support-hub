export const RATE_LIMIT_STORE = Symbol("RATE_LIMIT_STORE");

export type RateLimitResult = { count: number; resetAt: number };

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitResult>;
}

export type RateLimitStoreStatus = {
  mode: "redis" | "memory" | "memory_fallback";
  redisReady: boolean;
  lastError?: string;
};

export interface RateLimitStoreRuntime extends RateLimitStore {
  status(): RateLimitStoreStatus;
  close(): Promise<void>;
}

export type RateLimitMetrics = {
  recordRateLimitFallback: (reason: "redis_unavailable" | "redis_command_failed") => void;
  setRateLimitStoreAvailability: (available: boolean) => void;
};

export class InMemoryRateLimitStore implements RateLimitStoreRuntime {
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

  status(): RateLimitStoreStatus {
    return { mode: "memory", redisReady: false };
  }

  async close(): Promise<void> {}
}

export type RedisRateLimitMulti = {
  incr: (key: string) => RedisRateLimitMulti;
  pExpire: (key: string, milliseconds: number) => RedisRateLimitMulti;
  exec: () => Promise<unknown[]>;
};

export type RedisRateLimitClient = {
  multi: () => RedisRateLimitMulti;
  isReady?: boolean;
  isOpen?: boolean;
  quit?: () => Promise<unknown>;
  disconnect?: () => void;
};

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly client: RedisRateLimitClient) {}

  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const result = await this.client.multi().incr(key).pExpire(key, windowMs).exec();
    return { count: Number(result[0] as number), resetAt: Date.now() + windowMs };
  }
}

export class ResilientRedisRateLimitStore implements RateLimitStoreRuntime {
  private lastError: string | undefined;

  constructor(
    private readonly client: RedisRateLimitClient,
    private readonly fallback: InMemoryRateLimitStore = new InMemoryRateLimitStore(),
    private readonly metrics?: RateLimitMetrics
  ) {}

  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    if (!this.client.isReady) {
      this.metrics?.recordRateLimitFallback("redis_unavailable");
      return this.fallback.increment(key, windowMs);
    }

    try {
      const result = await new RedisRateLimitStore(this.client).increment(key, windowMs);
      this.metrics?.setRateLimitStoreAvailability(true);
      return result;
    } catch (error) {
      this.markError(error);
      this.metrics?.recordRateLimitFallback("redis_command_failed");
      return this.fallback.increment(key, windowMs);
    }
  }

  markReady() {
    this.lastError = undefined;
    this.metrics?.setRateLimitStoreAvailability(true);
  }

  markError(error: unknown) {
    this.lastError = error instanceof Error ? error.message : "Redis connection failed";
    this.metrics?.setRateLimitStoreAvailability(false);
  }

  status(): RateLimitStoreStatus {
    return this.client.isReady
      ? { mode: "redis", redisReady: true }
      : { mode: "memory_fallback", redisReady: false, ...(this.lastError ? { lastError: this.lastError } : {}) };
  }

  async close(): Promise<void> {
    if (!this.client.isOpen) return;
    if (!this.client.quit) {
      this.client.disconnect?.();
      return;
    }
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect?.();
    }
  }
}
