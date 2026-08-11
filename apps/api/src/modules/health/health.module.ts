import { Module } from "@nestjs/common";
import { RateLimitModule } from "../../infrastructure/rate-limit/rate-limit.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [RateLimitModule],
  controllers: [HealthController]
})
export class HealthModule {}
