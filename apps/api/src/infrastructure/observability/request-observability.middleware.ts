import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { MetricsService } from "./metrics.service";

@Injectable()
export class RequestObservabilityMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HttpRequest");

  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.header("x-request-id")?.slice(0, 128) || randomUUID();
    const startedAt = performance.now();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    res.on("finish", () => {
      const durationSeconds = (performance.now() - startedAt) / 1_000;
      const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || req.path || "unknown";
      this.metrics.recordHttpRequest({ method: req.method, route, statusCode: res.statusCode, durationSeconds });
      this.logger.log(JSON.stringify({
        event: "http_request_completed",
        requestId,
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationMs: Math.round(durationSeconds * 1_000)
      }));
    });
    next();
  }
}
