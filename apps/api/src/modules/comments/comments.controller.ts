import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentOrg } from "../../common/decorators/current-org.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser, RequestOrganization } from "../../common/types/request-context";
import { CommentsService } from "./comments.service";
import { CreateCommentDto } from "./dto/comment.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@UseGuards(JwtGuard, OrgGuard, RolesGuard)
@ApiTags("Comments")
@ApiBearerAuth("access-token")
@Controller("orgs/:orgSlug/workflow-items/:workflowItemId/comments")
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  list(@CurrentOrg() organization: RequestOrganization, @Param("workflowItemId") workflowItemId: string) {
    return this.commentsService.list(organization.id, workflowItemId);
  }

  @Post()
  @Roles("OWNER", "ADMIN", "MEMBER")
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @Param("workflowItemId") workflowItemId: string,
    @Body() dto: CreateCommentDto
  ) {
    return this.commentsService.create(organization.id, workflowItemId, user.userId, dto);
  }
}
