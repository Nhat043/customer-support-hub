import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MinLength } from "class-validator";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentOrg } from "../../common/decorators/current-org.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser, RequestOrganization } from "../../common/types/request-context";
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
  list(@CurrentOrg() organization: RequestOrganization) {
    return this.workspacesService.listByOrganizationId(organization.id);
  }

  @Post()
  @Roles("OWNER", "ADMIN")
  create(@CurrentOrg() organization: RequestOrganization, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(organization.id, dto.name, dto.slug);
  }

  @Get(":workspaceSlug")
  async getBySlug(
    @CurrentOrg() organization: RequestOrganization,
    @Param("workspaceSlug") workspaceSlug: string
  ) {
    return this.workspacesService.getBySlug(organization.id, workspaceSlug);
  }

  @Post(":workspaceSlug/switch")
  async switchWorkspace(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceSlug") workspaceSlug: string
  ) {
    await this.workspacesService.switchActive(user.sessionId, organization.id, workspaceSlug);
    return { ok: true, activeWorkspaceSlug: workspaceSlug };
  }
}
