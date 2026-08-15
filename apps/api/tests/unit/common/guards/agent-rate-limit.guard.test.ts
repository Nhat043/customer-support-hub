import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpException } from "@nestjs/common";
import { AgentRateLimitGuard } from "../../../../src/common/guards/agent-rate-limit.guard";
import { InMemoryRateLimitStore } from "../../../../src/common/rate-limit/rate-limit.store";

function config(values: Record<string, string> = {}) {
  return {
    get: (name: string, fallback: string) => values[name] ?? fallback
  } as any;
}

function metrics(events: string[] = []) {
  return { recordRateLimitHit: (scope: string) => events.push(scope) } as any;
}

function context(organizationId = "org-a", userId = "user-a") {
  return {
    switchToHttp: () => ({ getRequest: () => ({ organization: { id: organizationId }, user: { userId } }) })
  } as never;
}

test("agent guard limits a user across REST calls", async () => {
  const events: string[] = [];
  const guard = new AgentRateLimitGuard(new InMemoryRateLimitStore(), config({ AGENT_RATE_LIMIT_USER_PER_MINUTE: "2" }), metrics(events));

  assert.equal(await guard.canActivate(context()), true);
  assert.equal(await guard.canActivate(context()), true);
  await assert.rejects(() => guard.canActivate(context()), (error: HttpException) => {
    assert.equal(error.getStatus(), 429);
    const response = error.getResponse();
    assert.match(String(typeof response === "object" ? (response as any).message : error.message), /too many AI requests/);
    return true;
  });
  assert.deepEqual(events, ["agent_user"]);
});

test("agent guard applies a shared organization budget across users", async () => {
  const events: string[] = [];
  const guard = new AgentRateLimitGuard(
    new InMemoryRateLimitStore(),
    config({ AGENT_RATE_LIMIT_USER_PER_MINUTE: "10", AGENT_RATE_LIMIT_ORGANIZATION_PER_MINUTE: "2" }),
    metrics(events)
  );

  assert.equal(await guard.canActivate(context("org-a", "user-a")), true);
  assert.equal(await guard.canActivate(context("org-a", "user-b")), true);
  await assert.rejects(() => guard.canActivate(context("org-a", "user-c")), (error: HttpException) => {
    assert.equal(error.getStatus(), 429);
    assert.match(String((error.getResponse() as any).message), /workspace has reached/);
    return true;
  });
  assert.deepEqual(events, ["agent_organization"]);
  assert.equal(await guard.canActivate(context("org-b", "user-c")), true);
});
