import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MinLength } from "class-validator";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { WorkspacesService } from "./workspaces.service";
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";

class CreateWorkspaceDto {
  @ApiProperty({ example: "Operations" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: "operations" })
  @IsOptional()
  @IsString()
  slug?: string;
}

@UseGuards(JwtGuard, OrgGuard, RolesGuard)
@ApiTags("Workspaces")
@ApiBearerAuth("access-token")
@Controller("orgs/:orgSlug/workspaces")
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  list(@Req() req: any) {
    return this.workspacesService.listByOrganizationId(req.organization.id);
  }

  @Post()
  @Roles("OWNER", "ADMIN")
  create(@Req() req: any, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(req.organization.id, dto.name, dto.slug);
  }

  @Get(":workspaceSlug")
  async getBySlug(@Param("workspaceSlug") workspaceSlug: string, @Req() req: any) {
    return this.workspacesService.getBySlug(req.organization.id, workspaceSlug);
  }

  @Post(":workspaceSlug/switch")
  async switchWorkspace(@Param("workspaceSlug") workspaceSlug: string, @Req() req: any) {
    await this.workspacesService.switchActive(
      req.user.sessionId,
      req.organization.id,
      workspaceSlug
    );
    return { ok: true, activeWorkspaceSlug: workspaceSlug };
  }
}
