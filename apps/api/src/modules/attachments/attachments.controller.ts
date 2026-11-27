import { Controller, Delete, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentOrg } from "../../common/decorators/current-org.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CurrentMembership } from "../../common/decorators/current-membership.decorator";
import type {
  AuthenticatedUser,
  RequestMembership,
  RequestOrganization
} from "../../common/types/request-context";
import { AttachmentsService } from "./attachments.service";

@UseGuards(JwtGuard, OrgGuard, RolesGuard)
@ApiTags("Attachments")
@ApiBearerAuth("access-token")
@Controller("orgs/:orgSlug/workflow-items/:workflowItemId/attachments")
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @Roles("OWNER", "ADMIN", "MEMBER")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } })
  upload(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @Param("workflowItemId") workflowItemId: string,
    @UploadedFile() file?: any
  ) {
    return this.attachmentsService.upload({
      organizationId: organization.id,
      workflowItemId,
      uploadedById: user.userId,
      file
    });
  }

  @Get(":attachmentId/download")
  async download(
    @CurrentOrg() organization: RequestOrganization,
    @Param("workflowItemId") workflowItemId: string,
    @Param("attachmentId") attachmentId: string,
    @Res() response: Response
  ) {
    const result = await this.attachmentsService.download(organization.id, workflowItemId, attachmentId);
    response.setHeader("Content-Type", result.contentType);
    response.setHeader("Content-Length", result.content.length);
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(result.attachment.fileName)}`);
    // Send raw binary bytes. Returning a Buffer lets Nest serialize it as JSON.
    return response.send(result.content);
  }

  @Delete(":attachmentId")
  @Roles("OWNER", "ADMIN", "MEMBER")
  remove(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentMembership() membership: RequestMembership,
    @Param("workflowItemId") workflowItemId: string,
    @Param("attachmentId") attachmentId: string
  ) {
    return this.attachmentsService.remove({
      organizationId: organization.id,
      workflowItemId,
      attachmentId,
      actorUserId: user.userId,
      role: membership.role
    });
  }
}
