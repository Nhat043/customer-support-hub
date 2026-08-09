import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { CreateWorkflowItemDto, UpdateWorkflowItemDto } from "./dto/workflow-item.dto";

const userSummary = { id: true, fullName: true, email: true } as const;

@Injectable()
export class WorkflowItemsService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string, workspaceId?: string | null) {
    return this.prisma.workflowItem.findMany({
      where: {
        organizationId,
        ...(workspaceId ? { workspaceId } : {})
      },
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: userSummary },
        createdBy: { select: userSummary },
        comments: true,
        attachments: true
      }
    });
  }

  create(
    organizationId: string,
    createdById: string,
    dto: CreateWorkflowItemDto,
    workspaceId?: string | null
  ) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.workflowItem.create({
        data: {
          organizationId,
          workspaceId: workspaceId ?? undefined,
          createdById,
          type: dto.type ?? "general",
          title: dto.title,
          description: dto.description,
          priority: dto.priority ?? "MEDIUM"
        }
      });

      await tx.workflowEvent.create({
        data: {
          organizationId,
          workspaceId: workspaceId ?? undefined,
          workflowItemId: item.id,
          eventType: "CREATED",
          payload: { title: item.title }
        }
      });

      return item;
    });
  }

  async getById(organizationId: string, id: string) {
    const item = await this.prisma.workflowItem.findFirst({
      where: { id, organizationId },
      include: {
        owner: { select: userSummary },
        createdBy: { select: userSummary },
        comments: {
          orderBy: { createdAt: "asc" }
        },
        attachments: true,
        events: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!item) {
      throw new NotFoundException("Workflow item not found");
    }

    return item;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateWorkflowItemDto,
    actor: { userId: string; role: string },
  ) {
    const current = await this.getById(organizationId, id);
    const changesOwner = Object.hasOwn(dto, "ownerId");
    const changesDueAt = Object.hasOwn(dto, "dueAt");
    if (changesOwner && !["OWNER", "ADMIN"].includes(actor.role)) {
      throw new ForbiddenException("Only workspace owners and admins can assign customer requests");
    }
    const ownerId = changesOwner ? dto.ownerId ?? null : current.ownerId;
    if (ownerId && ownerId !== current.ownerId) {
      await this.assertAssignableMember(organizationId, ownerId);
    }
    const dueAt = changesDueAt ? (dto.dueAt ? new Date(dto.dueAt) : null) : current.dueAt;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workflowItem.update({
        where: { id },
        data: {
          title: dto.title ?? current.title,
          description: dto.description ?? current.description,
          status: dto.status ?? current.status,
          priority: dto.priority ?? current.priority,
          ownerId,
          dueAt,
          closedAt: dto.status === "CLOSED" ? new Date() : current.closedAt
        }
      });

      await tx.workflowEvent.create({
        data: {
          organizationId,
          workspaceId: current.workspaceId,
          workflowItemId: current.id,
          eventType: changesOwner ? "ASSIGNED" : "UPDATED",
          actorUserId: actor.userId,
          payload: { ...dto, ownerId, dueAt: dueAt?.toISOString() ?? null }
        }
      });
      if (changesOwner && ownerId && ownerId !== current.ownerId) {
        await tx.outboxEvent.create({
          data: {
            organizationId,
            type: "request.assigned",
            dedupeKey: `request-assigned:${current.id}:${ownerId}:${updated.updatedAt.toISOString()}`,
            payload: {
              workflowItemId: current.id,
              assigneeId: ownerId,
              title: updated.title,
              dueAt: dueAt?.toISOString() ?? null
            }
          }
        });
      }

      return updated;
    });
  }

  private async assertAssignableMember(organizationId: string, userId: string) {
    const member = await this.prisma.membership.findFirst({
      where: {
        organizationId,
        userId,
        status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN", "MEMBER"] }
      },
      select: { id: true }
    });
    if (!member) throw new NotFoundException("Assignee must be an active Owner, Admin, or Member in this workspace");
  }
}
