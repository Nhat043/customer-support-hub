import { Controller, Get, Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RATE_LIMIT_STORE, RateLimitStoreRuntime } from "../../common/rate-limit/rate-limit.store";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(@Inject(RATE_LIMIT_STORE) private readonly rateLimitStore: RateLimitStoreRuntime) {}

  @Get()
  getHealth() {
    return {
      ok: true,
      timestamp: new Date().toISOString(),
      dependencies: {
        rateLimit: this.rateLimitStore.status()
      }
    };
  }
}
