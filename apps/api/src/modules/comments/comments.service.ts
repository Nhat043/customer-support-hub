import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { CreateCommentDto } from "./dto/comment.dto";
import { notificationRecipients } from "../notifications/notification-recipients";
import { WorkspaceRealtimeGateway } from "../../infrastructure/realtime/workspace-realtime.gateway";

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: WorkspaceRealtimeGateway
  ) {}

  async list(organizationId: string, workflowItemId: string) {
    await this.assertWorkflowItem(organizationId, workflowItemId);
    return this.prisma.comment.findMany({
      where: { organizationId, workflowItemId },
      include: {
        authorUser: { select: { id: true, fullName: true, email: true } }
      },
      orderBy: { createdAt: "asc" }
    });
  }

  async create(
    organizationId: string,
    workflowItemId: string,
    authorUserId: string,
    dto: CreateCommentDto
  ) {
    const item = await this.assertWorkflowItem(organizationId, workflowItemId);
    const comment = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          organizationId,
          workspaceId: item.workspaceId,
          workflowItemId,
          authorUserId,
          authorType: "USER",
          body: dto.body.trim()
        },
        include: {
          authorUser: { select: { id: true, fullName: true, email: true } }
        }
      });

      await tx.workflowEvent.create({
        data: {
          organizationId,
          workspaceId: item.workspaceId,
          workflowItemId,
          eventType: "COMMENT_ADDED",
          payload: { commentId: comment.id }
        }
      });

      const recipients = notificationRecipients(authorUserId, item.ownerId, item.createdById);
      if (recipients.length) {
        await tx.outboxEvent.create({
          data: {
            organizationId,
            type: "request.comment_added",
            dedupeKey: `request-comment-added:${comment.id}`,
            payload: {
              workflowItemId,
              recipientIds: recipients,
              title: item.title,
              notificationType: "COMMENT_ADDED",
              notificationTitle: "New comment on customer request",
          notificationBody: `${comment.authorUser?.fullName ?? "A teammate"} added a comment.`
            }
          }
        });
      }

      return comment;
    });
    this.realtime?.publish({ organizationId, workspaceId: item.workspaceId, workflowItemId, entity: "comment", action: "created" });
    return comment;
  }

  private async assertWorkflowItem(organizationId: string, workflowItemId: string) {
    const item = await this.prisma.workflowItem.findFirst({
      where: { id: workflowItemId, organizationId },
      select: { id: true, workspaceId: true, ownerId: true, createdById: true, title: true }
    });
    if (!item) {
      throw new NotFoundException("Workflow item not found");
    }
    return item;
  }
}
