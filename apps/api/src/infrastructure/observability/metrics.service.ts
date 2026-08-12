import { Injectable } from "@nestjs/common";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly httpRequests = new Counter({
    name: "workflow_platform_http_requests_total",
    help: "Total completed HTTP requests",
    labelNames: ["method", "route", "status_code"],
    registers: [this.registry]
  });
  private readonly httpDuration = new Histogram({
    name: "workflow_platform_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"],
    registers: [this.registry]
  });
  private readonly agentRuns = new Counter({
    name: "workflow_platform_agent_runs_total",
    help: "Total agent runs by final status",
    labelNames: ["status", "model"],
    registers: [this.registry]
  });
  private readonly agentDuration = new Histogram({
    name: "workflow_platform_agent_run_duration_seconds",
    help: "Agent run duration in seconds",
    labelNames: ["status", "model"],
    registers: [this.registry]
  });
  private readonly agentToolCalls = new Counter({
    name: "workflow_platform_agent_tool_calls_total",
    help: "Total agent tool calls",
    labelNames: ["tool_name"],
    registers: [this.registry]
  });
  private readonly rateLimitFallbacks = new Counter({
    name: "workflow_platform_rate_limit_fallback_total",
    help: "Total rate-limit operations handled by the in-memory fallback",
    labelNames: ["reason"],
    registers: [this.registry]
  });
  private readonly rateLimitStoreAvailability = new Gauge({
    name: "workflow_platform_rate_limit_redis_available",
    help: "Whether the Redis-backed rate-limit store is currently available",
    registers: [this.registry]
  });
  private readonly notificationDeliveries = new Counter({
    name: "workflow_platform_notification_deliveries_total",
    help: "Total notification outbox delivery attempts by final status and event type",
    labelNames: ["status", "event_type"],
    registers: [this.registry]
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: "workflow_platform_" });
  }

  recordHttpRequest(input: { method: string; route: string; statusCode: number; durationSeconds: number }) {
    const labels = { method: input.method, route: input.route, status_code: String(input.statusCode) };
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, input.durationSeconds);
  }

  recordAgentRun(status: "SUCCEEDED" | "FAILED", model: string, durationSeconds: number) {
    this.agentRuns.inc({ status, model });
    this.agentDuration.observe({ status, model }, durationSeconds);
  }

  recordAgentToolCall(toolName: string) {
    this.agentToolCalls.inc({ tool_name: toolName });
  }

  recordRateLimitFallback(reason: "redis_unavailable" | "redis_command_failed") {
    this.rateLimitFallbacks.inc({ reason });
  }

  setRateLimitStoreAvailability(available: boolean) {
    this.rateLimitStoreAvailability.set(available ? 1 : 0);
  }

  recordNotificationDelivery(status: "DELIVERED" | "FAILED", eventType: string) {
    this.notificationDeliveries.inc({ status, event_type: eventType });
  }

  contentType() {
    return this.registry.contentType;
  }

  metrics() {
    return this.registry.metrics();
  }
}
