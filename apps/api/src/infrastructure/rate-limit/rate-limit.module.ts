import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "redis";
import {
  InMemoryRateLimitStore,
  RATE_LIMIT_STORE,
  ResilientRedisRateLimitStore
} from "../../common/rate-limit/rate-limit.store";
import { MetricsService } from "../observability/metrics.service";
import { ObservabilityModule } from "../observability/observability.module";
import { RateLimitLifecycle } from "./rate-limit.lifecycle";

@Module({
  imports: [ObservabilityModule],
  providers: [
    {
      provide: RATE_LIMIT_STORE,
      inject: [ConfigService, MetricsService],
      useFactory: (config: ConfigService, metrics: MetricsService) => {
        const redisUrl = config.get<string>("REDIS_URL");
        if (!redisUrl) {
          metrics.setRateLimitStoreAvailability(false);
          return new InMemoryRateLimitStore();
        }

        const client = createClient({
          url: redisUrl,
          socket: {
            reconnectStrategy: (attempt) => Math.min(100 * 2 ** attempt, 5_000)
          }
        });
        const store = new ResilientRedisRateLimitStore(client, new InMemoryRateLimitStore(), metrics);
        metrics.setRateLimitStoreAvailability(false);
        client.on("ready", () => store.markReady());
        client.on("error", (error) => store.markError(error));
        void client.connect().catch((error) => store.markError(error));
        return store;
      }
    },
    RateLimitLifecycle
  ],
  exports: [RATE_LIMIT_STORE]
})
export class RateLimitModule {}
