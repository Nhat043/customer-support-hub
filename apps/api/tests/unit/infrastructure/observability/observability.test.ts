import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { MetricsService } from "../../../../src/infrastructure/observability/metrics.service";
import { RequestObservabilityMiddleware } from "../../../../src/infrastructure/observability/request-observability.middleware";

test("metrics service exposes HTTP, agent, and rate-limit resilience metrics", async () => {
  const metrics = new MetricsService();
  metrics.recordHttpRequest({ method: "GET", route: "/api/health", statusCode: 200, durationSeconds: 0.01 });
  metrics.recordAgentToolCall("list_workflow_items");
  metrics.recordAgentRun("SUCCEEDED", "mock", 0.02);
  metrics.recordRateLimitFallback("redis_unavailable");
  metrics.setRateLimitStoreAvailability(false);

  const output = await metrics.metrics();
  assert.match(output, /workflow_platform_http_requests_total/);
  assert.match(output, /workflow_platform_agent_tool_calls_total/);
  assert.match(output, /workflow_platform_agent_runs_total/);
  assert.match(output, /workflow_platform_rate_limit_fallback_total/);
  assert.match(output, /workflow_platform_rate_limit_redis_available 0/);
  assert.match(metrics.contentType(), /text\/plain/);
});

test("request middleware propagates request id and records completion", () => {
  const records: unknown[] = [];
  const middleware = new RequestObservabilityMiddleware({
    recordHttpRequest: (input: unknown) => records.push(input)
  } as any);
  const response = Object.assign(new EventEmitter(), {
    statusCode: 201,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    }
  });
  const request = {
    method: "POST",
    baseUrl: "/api/workflow-items",
    path: "/",
    route: undefined,
    header: (name: string) => name === "x-request-id" ? "trace-123" : undefined
  } as any;
  let nextCalled = false;

  middleware.use(request, response as any, () => { nextCalled = true; });
  response.emit("finish");

  assert.equal(nextCalled, true);
  assert.equal(request.requestId, "trace-123");
  assert.equal(response.headers["x-request-id"], "trace-123");
  assert.equal((records[0] as any).route, "/api/workflow-items");
  assert.equal((records[0] as any).statusCode, 201);
});

test("request middleware creates an id and resolves matched or unknown routes", () => {
  const records: unknown[] = [];
  const middleware = new RequestObservabilityMiddleware({
    recordHttpRequest: (input: unknown) => records.push(input)
  } as any);
  const makeResponse = () => Object.assign(new EventEmitter(), {
    statusCode: 200,
    setHeader: () => undefined
  });

  const matchedRequest = {
    method: "GET",
    baseUrl: "/api",
    path: "/health",
    route: { path: "/health" },
    header: () => undefined
  } as any;
  const matchedResponse = makeResponse();
  middleware.use(matchedRequest, matchedResponse as any, () => undefined);
  matchedResponse.emit("finish");

  const unknownRequest = {
    method: "GET",
    baseUrl: "",
    path: "",
    route: undefined,
    header: () => undefined
  } as any;
  const unknownResponse = makeResponse();
  middleware.use(unknownRequest, unknownResponse as any, () => undefined);
  unknownResponse.emit("finish");

  assert.match(matchedRequest.requestId, /^[0-9a-f-]{36}$/);
  assert.equal((records[0] as any).route, "/api/health");
  assert.equal((records[1] as any).route, "unknown");
});
