import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentOrg } from "../../common/decorators/current-org.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CurrentMembership } from "../../common/decorators/current-membership.decorator";
import { ActiveWorkspaceId } from "../../common/decorators/active-workspace.decorator";
import type { AuthenticatedUser, RequestMembership, RequestOrganization } from "../../common/types/request-context";
import { CreateWorkflowItemDto, UpdateWorkflowItemDto } from "./dto/workflow-item.dto";
import { WorkflowItemsService } from "./workflow-items.service";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@UseGuards(JwtGuard, OrgGuard, RolesGuard)
@ApiTags("Workflow Items")
@ApiBearerAuth("access-token")
@Controller("orgs/:orgSlug/workflow-items")
export class WorkflowItemsController {
  constructor(private readonly workflowItemsService: WorkflowItemsService) {}

  @Get()
  list(
    @CurrentOrg() organization: RequestOrganization,
    @ActiveWorkspaceId() activeWorkspaceId: string | null,
    @Query("workspaceId") workspaceId?: string
  ) {
    // A repeated query parameter arrives as an array, which is not a workspace id.
    const requestedWorkspaceId = typeof workspaceId === "string" ? workspaceId : activeWorkspaceId;
    return this.workflowItemsService.list(organization.id, requestedWorkspaceId);
  }

  @Post()
  @Roles("OWNER", "ADMIN", "MEMBER")
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @ActiveWorkspaceId() activeWorkspaceId: string | null,
    @Body() dto: CreateWorkflowItemDto
  ) {
    return this.workflowItemsService.create(organization.id, user.userId, dto, activeWorkspaceId);
  }

  @Get(":id")
  getById(@CurrentOrg() organization: RequestOrganization, @Param("id") id: string) {
    return this.workflowItemsService.getById(organization.id, id);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN", "MEMBER")
  update(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentMembership() membership: RequestMembership,
    @Param("id") id: string,
    @Body() dto: UpdateWorkflowItemDto
  ) {
    return this.workflowItemsService.update(organization.id, id, dto, {
      userId: user.userId,
      role: membership.role
    });
  }
}
