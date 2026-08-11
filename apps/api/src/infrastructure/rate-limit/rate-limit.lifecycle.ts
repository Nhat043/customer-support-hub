import { Inject, Injectable, OnApplicationShutdown } from "@nestjs/common";
import { RATE_LIMIT_STORE, RateLimitStoreRuntime } from "../../common/rate-limit/rate-limit.store";

@Injectable()
export class RateLimitLifecycle implements OnApplicationShutdown {
  constructor(@Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStoreRuntime) {}

  async onApplicationShutdown(): Promise<void> {
    await this.store.close();
  }
}
