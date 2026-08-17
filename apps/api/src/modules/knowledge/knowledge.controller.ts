import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
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
  list(@Req() req: any) {
    return this.knowledge.list(req.organization.id, req.session?.workspaceId);
  }

  @Get(":documentId")
  getDocument(@Req() req: any, @Param("documentId") documentId: string) {
    return this.knowledge.getDocument(req.organization.id, req.session?.workspaceId, documentId);
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
  async upload(@Req() req: any, @UploadedFile() file: UploadedKnowledgeFile | undefined, @Body() dto: UploadKnowledgeDocumentDto) {
    if (!file) throw new BadRequestException("Knowledge document file is required");
    const extracted = await this.documentExtractor.extract(file);
    return this.knowledge.upload(req.organization.id, req.session?.workspaceId, req.user.userId, {
      fileName: extracted.fileName,
      title: dto.title,
      content: extracted.content
    });
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
