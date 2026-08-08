import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
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
  list(@CurrentUser() user: { userId: string }) {
    return this.organizationsService.listForUser(user.userId);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateOrganizationDto) {
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
  async switchOrg(@Req() req: any) {
    await this.organizationsService.switchActive(
      req.user.sessionId,
      req.organization.id
    );
    return {
      ok: true,
      activeOrganizationId: req.organization.id,
      activeMembershipRole: req.membership.role,
    };
  }
}
