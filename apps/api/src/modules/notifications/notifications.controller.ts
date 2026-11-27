import { Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { CurrentOrg } from "../../common/decorators/current-org.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser, RequestOrganization } from "../../common/types/request-context";
import { NotificationsService } from "./notifications.service";

@UseGuards(JwtGuard, OrgGuard)
@ApiTags("Notifications")
@ApiBearerAuth("access-token")
@Controller("orgs/:orgSlug/notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentOrg() organization: RequestOrganization, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.list(organization.id, user.userId);
  }

  @Patch(":id/read")
  markRead(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string
  ) {
    return this.notificationsService.markRead(organization.id, user.userId, id);
  }

  @Patch("read")
  markAllRead(@CurrentOrg() organization: RequestOrganization, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(organization.id, user.userId);
  }
}
