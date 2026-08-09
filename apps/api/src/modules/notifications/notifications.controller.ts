import { Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { OrgGuard } from "../../common/guards/org.guard";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

@UseGuards(JwtGuard, OrgGuard)
@ApiTags("Notifications")
@ApiBearerAuth("access-token")
@Controller("orgs/:orgSlug/notifications")
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() req: any) {
    return this.prisma.notification.findMany({
      where: { organizationId: req.organization.id, userId: req.user.userId },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  @Patch(":id/read")
  async markRead(@Req() req: any, @Param("id") id: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { id, organizationId: req.organization.id, userId: req.user.userId, readAt: null },
      data: { readAt: new Date() }
    });
    return { ok: true, updated: updated.count === 1 };
  }
}
