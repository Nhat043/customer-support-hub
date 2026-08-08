import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { CreateWorkflowItemDto, UpdateWorkflowItemDto } from "./dto/workflow-item.dto";

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
        owner: true,
        createdBy: true,
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
        owner: true,
        createdBy: true,
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

  async update(organizationId: string, id: string, dto: UpdateWorkflowItemDto) {
    const current = await this.getById(organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workflowItem.update({
        where: { id },
        data: {
          title: dto.title ?? current.title,
          description: dto.description ?? current.description,
          status: dto.status ?? current.status,
          priority: dto.priority ?? current.priority,
          closedAt: dto.status === "CLOSED" ? new Date() : current.closedAt
        }
      });

      await tx.workflowEvent.create({
        data: {
          organizationId,
          workspaceId: current.workspaceId,
          workflowItemId: current.id,
          eventType: "UPDATED",
          payload: { ...dto }
        }
      });

      return updated;
    });
  }
}
