import { BadRequestException, Body, Controller, Get, Headers, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AgentService } from "./agent.service";
import { CreateAgentRunDto } from "./dto/agent.dto";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";

@UseGuards(JwtGuard, OrgGuard, RolesGuard)
@ApiTags("Agent")
@ApiBearerAuth("access-token")
@Controller("orgs/:orgSlug/agent")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get("tools")
  tools() {
    return this.agentService.listTools();
  }

  @Get("runs")
  history(@Req() req: any, @Query("workspaceId") workspaceId?: string) {
    return this.agentService.history(req.organization.id, workspaceId);
  }

  @Get("memory")
  @ApiOperation({ summary: "List memory chunks visible to the authenticated agent user" })
  memory(@Req() req: any, @Query("workspaceId") workspaceId?: string) {
    return this.agentService.memoryHistory(req.organization.id, req.user.userId, workspaceId);
  }

  @Post("runs")
  @Roles("OWNER", "ADMIN", "MEMBER")
  @ApiOperation({ summary: "Run the agent over the authenticated tenant context" })
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "Unique client key used to prevent duplicate agent runs" })
  run(@Req() req: any, @Headers("idempotency-key") idempotencyKey: string | undefined, @Body() dto: CreateAgentRunDto) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException("Idempotency-Key header is required");
    }
    return this.agentService.run(
      req.organization.id,
      req.user.userId,
      req.user.sessionId,
      req.membership.role,
      idempotencyKey.trim(),
      dto
    );
  }
}
