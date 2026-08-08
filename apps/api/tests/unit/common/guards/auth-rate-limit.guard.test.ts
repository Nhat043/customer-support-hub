import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpException } from "@nestjs/common";
import { AuthRateLimitGuard } from "../../../../src/common/guards/auth-rate-limit.guard";
import { InMemoryRateLimitStore } from "../../../../src/common/rate-limit/rate-limit.store";

function context() {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip: "127.0.0.1", path: "/api/auth/login" })
    })
  } as never;
}

test("auth guard allows ten attempts and blocks the eleventh", async () => {
  const guard = new AuthRateLimitGuard(new InMemoryRateLimitStore());

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(await guard.canActivate(context()), true);
  }

  await assert.rejects(() => guard.canActivate(context()), (error: HttpException) => {
    assert.equal(error.getStatus(), 429);
    return true;
  });
});

test("auth guard keeps different clients in separate buckets", async () => {
  const guard = new AuthRateLimitGuard(new InMemoryRateLimitStore());
  const firstClient = context();
  const secondClient = {
    switchToHttp: () => ({
      getRequest: () => ({ ip: "127.0.0.2", path: "/api/auth/login" })
    })
  } as never;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await guard.canActivate(firstClient);
  }
  assert.equal(await guard.canActivate(secondClient), true);
});

test("auth guard falls back when client ip and path are missing", async () => {
  const guard = new AuthRateLimitGuard(new InMemoryRateLimitStore());
  const request = {
    switchToHttp: () => ({ getRequest: () => ({}) })
  } as never;
  assert.equal(await guard.canActivate(request), true);
});
