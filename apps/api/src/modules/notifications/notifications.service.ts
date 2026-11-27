import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

/** Most recent notifications returned by a single list request. */
const NOTIFICATION_PAGE_SIZE = 50;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every query is scoped to both the active organization and the recipient, so
   * a notification can never be read or acknowledged across a tenant boundary.
   */
  list(organizationId: string, userId: string) {
    return this.prisma.notification.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_PAGE_SIZE
    });
  }

  async markRead(organizationId: string, userId: string, notificationId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { id: notificationId, organizationId, userId, readAt: null },
      data: { readAt: new Date() }
    });
    return { ok: true, updated: updated.count === 1 };
  }

  async markAllRead(organizationId: string, userId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { organizationId, userId, readAt: null },
      data: { readAt: new Date() }
    });
    return { ok: true, updated: updated.count };
  }
}
