import { BadRequestException, Body, Controller, Delete, Get, Headers, Post, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AgentRateLimitGuard } from "../../common/guards/agent-rate-limit.guard";
import { CurrentOrg } from "../../common/decorators/current-org.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CurrentMembership } from "../../common/decorators/current-membership.decorator";
import type {
  AuthenticatedUser,
  RequestMembership,
  RequestOrganization
} from "../../common/types/request-context";
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
  history(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.agentService.history(organization.id, user.userId, workspaceId);
  }

  @Get("conversation")
  @ApiOperation({ summary: "Load the authenticated user's private agent conversation for this tenant" })
  conversation(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.agentService.conversation(organization.id, user.userId, workspaceId);
  }

  @Delete("conversation")
  @Roles("OWNER", "ADMIN", "MEMBER")
  @ApiOperation({ summary: "Permanently clear the authenticated user's private agent conversation and semantic memory" })
  clearConversation(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.agentService.clearConversation(organization.id, user.userId, workspaceId);
  }

  @Get("memory")
  @ApiOperation({ summary: "List memory chunks visible to the authenticated agent user" })
  memory(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @Query("workspaceId") workspaceId?: string
  ) {
    return this.agentService.memoryHistory(organization.id, user.userId, workspaceId);
  }

  @Post("runs")
  @Roles("OWNER", "ADMIN", "MEMBER")
  @UseGuards(AgentRateLimitGuard)
  @ApiOperation({ summary: "Run the agent over the authenticated tenant context" })
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "Unique client key used to prevent duplicate agent runs" })
  run(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentMembership() membership: RequestMembership,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: CreateAgentRunDto
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException("Idempotency-Key header is required");
    }
    return this.agentService.run(
      organization.id,
      user.userId,
      user.sessionId,
      membership.role,
      idempotencyKey.trim(),
      dto
    );
  }
}
