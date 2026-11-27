import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CurrentOrg } from "../../common/decorators/current-org.decorator";
import { CurrentMembership } from "../../common/decorators/current-membership.decorator";
import type {
  AuthenticatedUser,
  RequestMembership,
  RequestOrganization
} from "../../common/types/request-context";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { OrganizationsService } from "./organizations.service";
import { IsOptional, IsString, MinLength } from "class-validator";
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";

class CreateOrganizationDto {
  @ApiProperty({ example: "Acme Workspace" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: "acme-workspace" })
  @IsOptional()
  @IsString()
  slug?: string;
}

@UseGuards(JwtGuard)
@ApiTags("Organizations")
@ApiBearerAuth("access-token")
@Controller("orgs")
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.listForUser(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create({
      userId: user.userId,
      name: dto.name,
      slug: dto.slug
    });
  }

  @UseGuards(OrgGuard)
  @Get(":orgSlug")
  getOne(@Param("orgSlug") orgSlug: string) {
    return this.organizationsService.getBySlug(orgSlug);
  }

  @UseGuards(OrgGuard)
  @Post(":orgSlug/switch")
  async switchOrg(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentOrg() organization: RequestOrganization,
    @CurrentMembership() membership: RequestMembership
  ) {
    await this.organizationsService.switchActive(user.sessionId, organization.id);
    return {
      ok: true,
      activeOrganizationId: organization.id,
      activeMembershipRole: membership.role,
    };
  }
}
