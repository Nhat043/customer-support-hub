import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  @Get()
  getHealth(): { ok: true; timestamp: string } {
    return { ok: true, timestamp: new Date().toISOString() };
  }
}
