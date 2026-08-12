import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { EmailService } from "../../infrastructure/email/email.service";
import { MetricsService } from "../../infrastructure/observability/metrics.service";

type AssignmentPayload = { workflowItemId: string; assigneeId: string; title: string; dueAt?: string | null };
type NotificationPayload = AssignmentPayload & { notificationType?: "REQUEST_ASSIGNED" | "SLA_DUE_SOON" | "SLA_OVERDUE"; notificationTitle?: string };

@Injectable()
export class NotificationsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsWorker.name);
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly metrics: MetricsService
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.processPending(), 15_000);
    this.timer.unref();
    void this.processPending();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async processPending() {
    await this.publishSlaEvents();
    const events = await this.prisma.outboxEvent.findMany({ where: { status: { in: ["PENDING", "FAILED"] }, availableAt: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: 20 });
    await Promise.all(events.map((event) => this.processOne(event.id)));
  }

  private async processOne(id: string) {
    const claimed = await this.prisma.outboxEvent.updateMany({ where: { id, status: { in: ["PENDING", "FAILED"] }, availableAt: { lte: new Date() } }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
    if (claimed.count !== 1) return;
    const event = await this.prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    try {
      if (!["request.assigned", "request.sla_due_soon", "request.sla_overdue"].includes(event.type)) throw new Error(`Unsupported outbox event: ${event.type}`);
      const payload = event.payload as unknown as NotificationPayload;
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.assigneeId }, select: { email: true } });
      const type = payload.notificationType ?? "REQUEST_ASSIGNED";
      const title = payload.notificationTitle ?? "New customer request assigned";
      await this.prisma.notification.upsert({ where: { outboxEventId: event.id }, create: { outboxEventId: event.id, organizationId: event.organizationId, userId: payload.assigneeId, workflowItemId: payload.workflowItemId, type, title, body: payload.title }, update: {} });
      if (this.email.isEnabled()) {
        const delivery = await this.email.sendRequestAssigned({ recipient: user.email, requestTitle: payload.title, dueAt: payload.dueAt ? new Date(payload.dueAt) : null });
        if (!delivery.sent) throw new Error("Email delivery failed");
      }
      await this.prisma.outboxEvent.update({ where: { id }, data: { status: "DELIVERED", deliveredAt: new Date(), lastError: null } });
      this.metrics.recordNotificationDelivery("DELIVERED", event.type);
    } catch (error) {
      const delayMs = Math.min(60_000 * 2 ** Math.min(event.attempts, 6), 3_600_000);
      await this.prisma.outboxEvent.update({ where: { id }, data: { status: "FAILED", availableAt: new Date(Date.now() + delayMs), lastError: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed" } });
      this.metrics.recordNotificationDelivery("FAILED", event.type);
      this.logger.error(`Outbox event ${id} failed`);
    }
  }

  private async publishSlaEvents() {
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
    const items = await this.prisma.workflowItem.findMany({ where: { ownerId: { not: null }, dueAt: { not: null, lte: dueSoon }, status: { not: "CLOSED" } }, select: { id: true, organizationId: true, ownerId: true, title: true, dueAt: true } });
    await this.prisma.outboxEvent.createMany({ data: items.map((item) => {
      const overdue = item.dueAt! <= now;
      const type = overdue ? "request.sla_overdue" : "request.sla_due_soon";
      return { organizationId: item.organizationId, type, dedupeKey: `${type}:${item.id}:${item.dueAt!.toISOString()}`, payload: { workflowItemId: item.id, assigneeId: item.ownerId!, title: item.title, dueAt: item.dueAt!.toISOString(), notificationType: overdue ? "SLA_OVERDUE" : "SLA_DUE_SOON", notificationTitle: overdue ? "Customer request is overdue" : "Customer request deadline is approaching" } };
    }), skipDuplicates: true });
  }
}
