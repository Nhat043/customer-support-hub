import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { TeamService } from "./team.service";
import {
  CreateInvitationDto,
  UpdateMembershipRoleDto,
} from "./dto/team.dto";

@UseGuards(JwtGuard, OrgGuard, RolesGuard)
@ApiTags("Team")
@ApiBearerAuth("access-token")
@Controller("orgs/:orgSlug")
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get("members")
  @Roles("OWNER", "ADMIN")
  listMembers(@Req() req: any) {
    return this.teamService.listMembers(req.organization.id);
  }

  @Get("invitations")
  @Roles("OWNER", "ADMIN")
  listInvitations(@Req() req: any) {
    return this.teamService.listInvitations(req.organization.id);
  }

  @Post("invitations")
  @Roles("OWNER", "ADMIN")
  createInvitation(
    @Req() req: any,
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateInvitationDto,
  ) {
    return this.teamService.createInvitation({
      organizationId: req.organization.id,
      invitedById: user.userId,
      inviterRole: req.membership.role,
      email: dto.email,
      role: dto.role,
    });
  }

  @Delete("invitations/:invitationId")
  @Roles("OWNER", "ADMIN")
  revokeInvitation(
    @Req() req: any,
    @CurrentUser() user: { userId: string },
    @Param("invitationId") invitationId: string,
  ) {
    return this.teamService.revokeInvitation({
      organizationId: req.organization.id,
      invitationId,
      actorUserId: user.userId,
      actorRole: req.membership.role,
    });
  }

  @Patch("members/:membershipId")
  @Roles("OWNER")
  updateMemberRole(
    @Req() req: any,
    @CurrentUser() user: { userId: string },
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMembershipRoleDto,
  ) {
    return this.teamService.updateMembershipRole({
      organizationId: req.organization.id,
      actorUserId: user.userId,
      membershipId,
      role: dto.role,
    });
  }

  @Delete("members/:membershipId")
  @Roles("OWNER")
  removeMember(
    @Req() req: any,
    @CurrentUser() user: { userId: string },
    @Param("membershipId") membershipId: string,
  ) {
    return this.teamService.removeMember({
      organizationId: req.organization.id,
      actorUserId: user.userId,
      membershipId,
    });
  }
}
