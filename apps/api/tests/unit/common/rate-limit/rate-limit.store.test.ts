import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InMemoryRateLimitStore,
  RedisRateLimitStore
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
