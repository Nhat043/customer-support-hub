import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { CreateCommentDto } from "./dto/comment.dto";

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.$transaction(async (tx) => {
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

      return comment;
    });
  }

  private async assertWorkflowItem(organizationId: string, workflowItemId: string) {
    const item = await this.prisma.workflowItem.findFirst({
      where: { id: workflowItemId, organizationId },
      select: { id: true, workspaceId: true }
    });
    if (!item) {
      throw new NotFoundException("Workflow item not found");
    }
    return item;
  }
}
