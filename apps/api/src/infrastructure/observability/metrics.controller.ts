import { Controller, Get, Header } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { MetricsService } from "./metrics.service";

@ApiTags("Observability")
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @ApiExcludeEndpoint()
  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  getMetrics() {
    return this.metrics.metrics();
  }
}
