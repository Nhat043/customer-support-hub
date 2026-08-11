import assert from "node:assert/strict";
import test from "node:test";
import { HealthController } from "../../../src/modules/health/health.controller";
import { RateLimitLifecycle } from "../../../src/infrastructure/rate-limit/rate-limit.lifecycle";

test("health endpoint reports the active rate-limit backend without failing during Redis fallback", () => {
  const controller = new HealthController({
    status: () => ({ mode: "memory_fallback", redisReady: false, lastError: "connection refused" })
  } as any);

  const result = controller.getHealth();
  assert.equal(result.ok, true);
  assert.match(result.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(result.dependencies.rateLimit, {
    mode: "memory_fallback",
    redisReady: false,
    lastError: "connection refused"
  });
});

test("rate-limit lifecycle closes the store during Nest shutdown", async () => {
  let closeCalls = 0;
  const lifecycle = new RateLimitLifecycle({
    increment: async () => ({ count: 1, resetAt: 0 }),
    status: () => ({ mode: "memory", redisReady: false }),
    close: async () => { closeCalls += 1; }
  });

  await lifecycle.onApplicationShutdown();
  assert.equal(closeCalls, 1);
});
