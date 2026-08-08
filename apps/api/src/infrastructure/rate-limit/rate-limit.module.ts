import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "redis";
import {
  InMemoryRateLimitStore,
  RATE_LIMIT_STORE,
  RedisRateLimitStore
} from "../../common/rate-limit/rate-limit.store";

@Module({
  providers: [
    {
      provide: RATE_LIMIT_STORE,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisUrl = config.get<string>("REDIS_URL");
        if (!redisUrl) return new InMemoryRateLimitStore();

        const client = createClient({ url: redisUrl });
        client.on("error", (error) => console.error("Redis rate-limit error", error));
        await client.connect();
        return new RedisRateLimitStore(client);
      }
    }
  ],
  exports: [RATE_LIMIT_STORE]
})
export class RateLimitModule {}
