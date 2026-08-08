import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
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
  list(@Req() req: any) {
    return this.workflowItemsService.list(
      req.organization.id,
      typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined
    );
  }

  @Post()
  @Roles("OWNER", "ADMIN", "MEMBER")
  create(@Req() req: any, @Body() dto: CreateWorkflowItemDto) {
    return this.workflowItemsService.create(req.organization.id, req.user.userId, dto);
  }

  @Get(":id")
  getById(@Req() req: any, @Param("id") id: string) {
    return this.workflowItemsService.getById(req.organization.id, id);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN", "MEMBER")
  update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateWorkflowItemDto) {
    return this.workflowItemsService.update(req.organization.id, id, dto);
  }
}
