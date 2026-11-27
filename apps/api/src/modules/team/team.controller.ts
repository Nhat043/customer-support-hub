import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CurrentOrg } from "../../common/decorators/current-org.decorator";
import { CurrentMembership } from "../../common/decorators/current-membership.decorator";
import type {
  AuthenticatedUser,
  RequestMembership,
  RequestOrganization,
} from "../../common/types/request-context";
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
  @Roles("OWNER", "ADMIN", "MEMBER")
  listMembers(@CurrentOrg() organization: RequestOrganization) {
    return this.teamService.listMembers(organization.id);
  }

  @Get("invitations")
  @Roles("OWNER", "ADMIN")
  listInvitations(@CurrentOrg() organization: RequestOrganization) {
    return this.teamService.listInvitations(organization.id);
  }

  @Post("invitations")
  @Roles("OWNER", "ADMIN")
  createInvitation(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentMembership() membership: RequestMembership,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.teamService.createInvitation({
      organizationId: organization.id,
      invitedById: user.userId,
      inviterRole: membership.role,
      email: dto.email,
      role: dto.role,
    });
  }

  @Delete("invitations/:invitationId")
  @Roles("OWNER", "ADMIN")
  revokeInvitation(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentMembership() membership: RequestMembership,
    @Param("invitationId") invitationId: string,
  ) {
    return this.teamService.revokeInvitation({
      organizationId: organization.id,
      invitationId,
      actorUserId: user.userId,
      actorRole: membership.role,
    });
  }

  @Patch("members/:membershipId")
  @Roles("OWNER")
  updateMemberRole(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMembershipRoleDto,
  ) {
    return this.teamService.updateMembershipRole({
      organizationId: organization.id,
      actorUserId: user.userId,
      membershipId,
      role: dto.role,
    });
  }

  @Delete("members/:membershipId")
  @Roles("OWNER")
  removeMember(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @Param("membershipId") membershipId: string,
  ) {
    return this.teamService.removeMember({
      organizationId: organization.id,
      actorUserId: user.userId,
      membershipId,
    });
  }
}
