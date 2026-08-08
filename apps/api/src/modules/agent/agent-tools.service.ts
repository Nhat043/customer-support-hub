import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { WorkflowItemStatus } from "../../../node_modules/.prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export type AgentToolContext = {
  organizationId: string;
  userId: string;
  membershipRole: string;
  workspaceId?: string;
};

export type RegisteredTool = {
  name: string;
  description: string;
  execute: (
    context: AgentToolContext,
    args: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
};

const workflowStatuses = new Set<string>([
  "NEW",
  "TRIAGE",
  "IN_PROGRESS",
  "WAITING",
  "RESOLVED",
  "CLOSED"
]);

@Injectable()
export class AgentToolsService {
  private readonly tools: Map<string, RegisteredTool>;

  constructor(private readonly prisma: PrismaService) {
    this.tools = new Map([
      ["list_workflow_items", {
        name: "list_workflow_items",
        description: "List workflow items inside the current organization and optional workspace.",
        execute: (context) => this.listWorkflowItems(context)
      }],
      ["create_workflow_item", {
        name: "create_workflow_item",
        description: "Create a workflow item in the current organization and optional workspace.",
        execute: (context, args) => this.createWorkflowItem(context, args)
      }],
      ["update_workflow_status", {
        name: "update_workflow_status",
        description: "Update a workflow item's status after checking tenant ownership.",
        execute: (context, args) => this.updateWorkflowStatus(context, args)
      }],
      ["add_comment", {
        name: "add_comment",
        description: "Add a comment to a workflow item in the current organization.",
        execute: (context, args) => this.addComment(context, args)
      }]
    ]);
  }

  listDefinitions() {
    return [...this.tools.values()].map(({ name, description }) => ({ name, description }));
  }

  async execute(
    name: string,
    context: AgentToolContext,
    args: Record<string, unknown>
  ) {
    const tool = this.tools.get(name);
    if (!tool) throw new BadRequestException(`Unknown agent tool: ${name}`);
    return tool.execute(context, args);
  }

  private assertCanMutate(context: AgentToolContext) {
    if (context.membershipRole === "VIEWER") {
      throw new ForbiddenException("Viewer membership cannot mutate workflow data");
    }
  }

  private async listWorkflowItems(context: AgentToolContext) {
    const items = await this.prisma.workflowItem.findMany({
      where: {
        organizationId: context.organizationId,
        ...(context.workspaceId ? { workspaceId: context.workspaceId } : {})
      },
      select: { id: true, title: true, status: true, priority: true, workspaceId: true },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return { count: items.length, items };
  }

  private async createWorkflowItem(context: AgentToolContext, args: Record<string, unknown>) {
    this.assertCanMutate(context);
    const title = typeof args.title === "string" ? args.title.trim() : "";
    if (title.length < 2 || title.length > 200) {
      throw new BadRequestException("A workflow title must contain 2-200 characters");
    }
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workflowItem.create({
        data: {
          organizationId: context.organizationId,
          workspaceId: context.workspaceId,
          createdById: context.userId,
          type: "general",
          title,
          priority: "MEDIUM"
        },
        select: { id: true, title: true, status: true, workspaceId: true }
      });
      await tx.workflowEvent.create({
        data: {
          organizationId: context.organizationId,
          workspaceId: context.workspaceId,
          workflowItemId: created.id,
          eventType: "CREATED",
          payload: { title: created.title, source: "agent" }
        }
      });
      return created;
    });
    return { item };
  }

  private async updateWorkflowStatus(context: AgentToolContext, args: Record<string, unknown>) {
    this.assertCanMutate(context);
    const workflowItemId = typeof args.workflowItemId === "string" ? args.workflowItemId : "";
    const status = typeof args.status === "string" ? args.status.toUpperCase() : "";
    if (!workflowItemId || !workflowStatuses.has(status)) {
      throw new BadRequestException("workflowItemId and a valid status are required");
    }
    const current = await this.prisma.workflowItem.findFirst({
      where: {
        id: workflowItemId,
        organizationId: context.organizationId,
        ...(context.workspaceId ? { workspaceId: context.workspaceId } : {})
      },
      select: { id: true, workspaceId: true, title: true }
    });
    if (!current) throw new NotFoundException("Workflow item not found");
    const item = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workflowItem.update({
        where: { id: current.id },
        data: { status: status as WorkflowItemStatus, closedAt: status === "CLOSED" ? new Date() : null },
        select: { id: true, title: true, status: true, workspaceId: true }
      });
      await tx.workflowEvent.create({
        data: {
          organizationId: context.organizationId,
          workspaceId: current.workspaceId,
          workflowItemId: current.id,
          eventType: "STATUS_CHANGED",
          payload: { status, source: "agent" }
        }
      });
      return updated;
    });
    return { item };
  }

  private async addComment(context: AgentToolContext, args: Record<string, unknown>) {
    this.assertCanMutate(context);
    const workflowItemId = typeof args.workflowItemId === "string" ? args.workflowItemId : "";
    const body = typeof args.body === "string" ? args.body.trim() : "";
    if (!workflowItemId || body.length < 1 || body.length > 4000) {
      throw new BadRequestException("workflowItemId and a comment body are required");
    }
    const item = await this.prisma.workflowItem.findFirst({
      where: {
        id: workflowItemId,
        organizationId: context.organizationId,
        ...(context.workspaceId ? { workspaceId: context.workspaceId } : {})
      },
      select: { id: true, workspaceId: true }
    });
    if (!item) throw new NotFoundException("Workflow item not found");
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          organizationId: context.organizationId,
          workspaceId: item.workspaceId,
          workflowItemId: item.id,
          authorUserId: context.userId,
          authorType: "AGENT",
          body
        },
        select: { id: true, body: true, workflowItemId: true, createdAt: true }
      });
      await tx.workflowEvent.create({
        data: {
          organizationId: context.organizationId,
          workspaceId: item.workspaceId,
          workflowItemId: item.id,
          eventType: "COMMENT_ADDED",
          payload: { commentId: created.id, source: "agent" }
        }
      });
      return created;
    });
    return { comment };
  }
}
