import { Controller, Delete, Get, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
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
  upload(@Req() req: any, @Param("workflowItemId") workflowItemId: string, @UploadedFile() file?: any) {
    return this.attachmentsService.upload({
      organizationId: req.organization.id,
      workflowItemId,
      uploadedById: req.user.userId,
      file
    });
  }

  @Get(":attachmentId/download")
  async download(
    @Req() req: any,
    @Param("workflowItemId") workflowItemId: string,
    @Param("attachmentId") attachmentId: string,
    @Res() response: Response
  ) {
    const result = await this.attachmentsService.download(req.organization.id, workflowItemId, attachmentId);
    response.setHeader("Content-Type", result.contentType);
    response.setHeader("Content-Length", result.content.length);
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(result.attachment.fileName)}`);
    // Send raw binary bytes. Returning a Buffer lets Nest serialize it as JSON.
    return response.send(result.content);
  }

  @Delete(":attachmentId")
  @Roles("OWNER", "ADMIN", "MEMBER")
  remove(@Req() req: any, @Param("workflowItemId") workflowItemId: string, @Param("attachmentId") attachmentId: string) {
    return this.attachmentsService.remove({
      organizationId: req.organization.id,
      workflowItemId,
      attachmentId,
      actorUserId: req.user.userId,
      role: req.membership.role
    });
  }
}
