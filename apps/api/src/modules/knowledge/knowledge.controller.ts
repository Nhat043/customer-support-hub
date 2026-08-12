import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { UploadKnowledgeDocumentDto } from "./dto/knowledge.dto";
import { WorkspaceKnowledgeService } from "./knowledge.service";

@UseGuards(JwtGuard, OrgGuard, RolesGuard)
@ApiTags("Knowledge")
@ApiBearerAuth("access-token")
@Controller("orgs/:orgSlug/knowledge")
export class KnowledgeController {
  constructor(private readonly knowledge: WorkspaceKnowledgeService) {}

  @Get()
  list(@Req() req: any) {
    return this.knowledge.list(req.organization.id, req.session?.workspaceId);
  }

  @Get(":documentId")
  getDocument(@Req() req: any, @Param("documentId") documentId: string) {
    return this.knowledge.getDocument(req.organization.id, req.session?.workspaceId, documentId);
  }

  @Post()
  @Roles("OWNER", "ADMIN")
  upload(@Req() req: any, @Body() dto: UploadKnowledgeDocumentDto) {
    return this.knowledge.upload(req.organization.id, req.session?.workspaceId, req.user.userId, dto);
  }

  @Post(":documentId/retry")
  @Roles("OWNER", "ADMIN")
  retry(@Req() req: any, @Param("documentId") documentId: string) {
    return this.knowledge.retry(req.organization.id, req.session?.workspaceId, documentId);
  }

  @Delete(":documentId")
  @Roles("OWNER", "ADMIN")
  remove(@Req() req: any, @Param("documentId") documentId: string) {
    return this.knowledge.remove(req.organization.id, req.session?.workspaceId, documentId);
  }
}
