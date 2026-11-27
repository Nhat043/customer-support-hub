import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentOrg } from "../../common/decorators/current-org.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ActiveWorkspaceId } from "../../common/decorators/active-workspace.decorator";
import type { AuthenticatedUser, RequestOrganization } from "../../common/types/request-context";
import { UploadKnowledgeDocumentDto } from "./dto/knowledge.dto";
import { KnowledgeDocumentExtractor, MAX_KNOWLEDGE_FILE_BYTES, UploadedKnowledgeFile } from "./knowledge-document-extractor";
import { WorkspaceKnowledgeService } from "./knowledge.service";

@UseGuards(JwtGuard, OrgGuard, RolesGuard)
@ApiTags("Knowledge")
@ApiBearerAuth("access-token")
@Controller("orgs/:orgSlug/knowledge")
export class KnowledgeController {
  constructor(
    private readonly knowledge: WorkspaceKnowledgeService,
    private readonly documentExtractor: KnowledgeDocumentExtractor
  ) {}

  @Get()
  list(@CurrentOrg() organization: RequestOrganization, @ActiveWorkspaceId() workspaceId: string | null) {
    return this.knowledge.list(organization.id, workspaceId);
  }

  @Get(":documentId")
  getDocument(
    @CurrentOrg() organization: RequestOrganization,
    @ActiveWorkspaceId() workspaceId: string | null,
    @Param("documentId") documentId: string
  ) {
    return this.knowledge.getDocument(organization.id, workspaceId, documentId);
  }

  @Post()
  @Roles("OWNER", "ADMIN")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_KNOWLEDGE_FILE_BYTES } }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: { type: "string", format: "binary", description: "Markdown, PDF, or DOCX guide up to 10 MB" },
        title: { type: "string", maxLength: 160 }
      }
    }
  })
  async upload(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @ActiveWorkspaceId() workspaceId: string | null,
    @UploadedFile() file: UploadedKnowledgeFile | undefined,
    @Body() dto: UploadKnowledgeDocumentDto
  ) {
    if (!file) throw new BadRequestException("Knowledge document file is required");
    const extracted = await this.documentExtractor.extract(file);
    return this.knowledge.upload(organization.id, workspaceId, user.userId, {
      fileName: extracted.fileName,
      title: dto.title,
      content: extracted.content
    });
  }

  @Post(":documentId/retry")
  @Roles("OWNER", "ADMIN")
  retry(
    @CurrentOrg() organization: RequestOrganization,
    @ActiveWorkspaceId() workspaceId: string | null,
    @Param("documentId") documentId: string
  ) {
    return this.knowledge.retry(organization.id, workspaceId, documentId);
  }

  @Delete(":documentId")
  @Roles("OWNER", "ADMIN")
  remove(
    @CurrentOrg() organization: RequestOrganization,
    @ActiveWorkspaceId() workspaceId: string | null,
    @Param("documentId") documentId: string
  ) {
    return this.knowledge.remove(organization.id, workspaceId, documentId);
  }
}
