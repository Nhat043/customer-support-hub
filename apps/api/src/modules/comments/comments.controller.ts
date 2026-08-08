import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
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
  list(@Req() req: any, @Param("workflowItemId") workflowItemId: string) {
    return this.commentsService.list(req.organization.id, workflowItemId);
  }

  @Post()
  @Roles("OWNER", "ADMIN", "MEMBER")
  create(
    @Req() req: any,
    @Param("workflowItemId") workflowItemId: string,
    @Body() dto: CreateCommentDto
  ) {
    return this.commentsService.create(
      req.organization.id,
      workflowItemId,
      req.user.userId,
      dto
    );
  }
}
