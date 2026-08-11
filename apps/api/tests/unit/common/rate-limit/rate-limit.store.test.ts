import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InMemoryRateLimitStore,
  RedisRateLimitStore,
  ResilientRedisRateLimitStore
} from "../../../../src/common/rate-limit/rate-limit.store";

test("in-memory store counts within a window and resets after expiry", async () => {
  let now = 1_000;
  const store = new InMemoryRateLimitStore(() => now);

  assert.deepEqual(await store.increment("auth:client", 100), {
    count: 1,
    resetAt: 1_100
  });
  assert.equal((await store.increment("auth:client", 100)).count, 2);

  now = 1_100;
  assert.equal((await store.increment("auth:client", 100)).count, 1);
});

test("redis store uses an atomic increment and expiry transaction", async () => {
  const calls: string[] = [];
  const client = {
    multi() {
      return {
        incr(key: string) {
          calls.push(`incr:${key}`);
          return this;
        },
        pExpire(key: string, milliseconds: number) {
          calls.push(`pexpire:${key}:${milliseconds}`);
          return this;
        },
        async exec() {
          calls.push("exec");
          return [3, 1];
        }
      };
    }
  };

  const result = await new RedisRateLimitStore(client).increment("auth:client", 60_000);
  assert.equal(result.count, 3);
  assert.deepEqual(calls, [
    "incr:auth:client",
    "pexpire:auth:client:60000",
    "exec"
  ]);
});

test("resilient store falls back to memory while Redis is unavailable and recovers automatically", async () => {
  const metrics: string[] = [];
  const client = {
    isReady: false,
    multi: () => {
      throw new Error("Redis should not be called while unavailable");
    }
  };
  const store = new ResilientRedisRateLimitStore(client, undefined, {
    recordRateLimitFallback: (reason) => metrics.push(`fallback:${reason}`),
    setRateLimitStoreAvailability: (available) => metrics.push(`available:${available}`)
  });

  assert.equal((await store.increment("auth:client", 60_000)).count, 1);
  assert.deepEqual(store.status(), { mode: "memory_fallback", redisReady: false });
  assert.deepEqual(metrics, ["fallback:redis_unavailable"]);

  client.isReady = true;
  (client as any).multi = () => ({
    incr: () => ({
      pExpire: () => ({ exec: async () => [2, 1] })
    })
  });
  store.markReady();

  assert.equal((await store.increment("auth:client", 60_000)).count, 2);
  assert.deepEqual(store.status(), { mode: "redis", redisReady: true });
  assert.deepEqual(metrics, ["fallback:redis_unavailable", "available:true", "available:true"]);
});

test("resilient store falls back after a Redis command error and exposes the failure in health status", async () => {
  const events: string[] = [];
  const client = {
    isReady: true,
    multi: () => ({
      incr: () => ({
        pExpire: () => ({ exec: async () => { throw new Error("connection reset"); } })
      })
    })
  };
  const store = new ResilientRedisRateLimitStore(client, undefined, {
    recordRateLimitFallback: (reason) => events.push(`fallback:${reason}`),
    setRateLimitStoreAvailability: (available) => events.push(`available:${available}`)
  });

  assert.equal((await store.increment("auth:client", 60_000)).count, 1);
  store.markError(new Error("connection reset"));
  client.isReady = false;

  assert.deepEqual(store.status(), {
    mode: "memory_fallback",
    redisReady: false,
    lastError: "connection reset"
  });
  assert.deepEqual(events, ["available:false", "fallback:redis_command_failed", "available:false"]);
});

test("resilient store closes Redis cleanly and disconnects when quit fails", async () => {
  const calls: string[] = [];
  const store = new ResilientRedisRateLimitStore({
    isOpen: true,
    multi: () => ({} as any),
    quit: async () => { throw new Error("quit failed"); },
    disconnect: () => calls.push("disconnect")
  });

  await store.close();
  assert.deepEqual(calls, ["disconnect"]);
});
