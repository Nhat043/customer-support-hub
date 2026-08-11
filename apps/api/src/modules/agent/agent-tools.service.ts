import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { WorkflowItemStatus, WorkflowPriority } from "../../../node_modules/.prisma/client";
import type { AgentUiAction } from "./agent.provider";
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
const workflowPriorities = new Set<string>(["LOW", "MEDIUM", "HIGH", "URGENT"]);

@Injectable()
export class AgentToolsService {
  private readonly tools: Map<string, RegisteredTool>;

  constructor(private readonly prisma: PrismaService) {
    this.tools = new Map([
      ["list_workflow_items", {
        name: "list_workflow_items",
        description: "List workflow items inside the current organization and optional workspace.",
        execute: (context, args) => this.listWorkflowItems(context, args)
      }],
      ["get_workflow_item", {
        name: "get_workflow_item",
        description: "Read the complete tenant-scoped details of one customer request by its workflow item ID.",
        execute: (context, args) => this.getWorkflowItem(context, args)
      }],
      ["get_support_queue_summary", {
        name: "get_support_queue_summary",
        description: "Calculate request counts by status and identify new, overdue, and unassigned work inside the current tenant.",
        execute: (context) => this.getSupportQueueSummary(context)
      }],
      ["navigate_to", {
        name: "navigate_to",
        description: "Navigate the signed-in user to an allow-listed dashboard, request queue, or tenant-owned request detail page.",
        execute: (context, args) => this.navigateTo(context, args)
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

  private async listWorkflowItems(context: AgentToolContext, args: Record<string, unknown>) {
    const status = this.optionalEnum(args.status, workflowStatuses, "status") as WorkflowItemStatus | undefined;
    const priority = this.optionalEnum(args.priority, workflowPriorities, "priority") as WorkflowPriority | undefined;
    const query = typeof args.query === "string" ? args.query.trim().slice(0, 100) : "";
    const limit = this.limit(args.limit);
    const items = await this.prisma.workflowItem.findMany({
      where: {
        organizationId: context.organizationId,
        ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] } : {})
      },
      select: { id: true, title: true, status: true, priority: true, workspaceId: true, dueAt: true, owner: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    const filters = { ...(status ? { status } : {}), ...(priority ? { priority } : {}), ...(query ? { query } : {}) };
    return {
      count: items.length,
      items,
      uiAction: this.navigate("requests", `Open ${items.length} matching request${items.length === 1 ? "" : "s"}`, filters)
    };
  }

  private async getSupportQueueSummary(context: AgentToolContext) {
    const items = await this.prisma.workflowItem.findMany({
      where: {
        organizationId: context.organizationId,
        ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
        status: { not: "CLOSED" }
      },
      select: { status: true, priority: true, dueAt: true, ownerId: true }
    });
    const now = new Date();
    const byStatus = Object.fromEntries([...workflowStatuses].map((status) => [status, 0])) as Record<string, number>;
    for (const item of items) byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    const overdue = items.filter((item) => item.dueAt && item.dueAt < now).length;
    const unassigned = items.filter((item) => !item.ownerId).length;
    const urgent = items.filter((item) => item.priority === "URGENT" || item.priority === "HIGH").length;
    return {
      openCount: items.length,
      newCount: byStatus.NEW,
      overdueCount: overdue,
      unassignedCount: unassigned,
      highPriorityCount: urgent,
      byStatus,
      uiAction: this.navigate("requests", "Open customer request queue")
    };
  }

  private async getWorkflowItem(context: AgentToolContext, args: Record<string, unknown>) {
    const workflowItemId = typeof args.workflowItemId === "string" ? args.workflowItemId : "";
    if (!workflowItemId) throw new BadRequestException("workflowItemId is required");
    const item = await this.prisma.workflowItem.findFirst({
      where: {
        id: workflowItemId,
        organizationId: context.organizationId,
        ...(context.workspaceId ? { workspaceId: context.workspaceId } : {})
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueAt: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { id: true, fullName: true } },
        comments: {
          select: { body: true, createdAt: true, authorType: true, authorUser: { select: { fullName: true } } },
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    });
    if (!item) throw new NotFoundException("Workflow item not found");
    return {
      item,
      uiAction: this.navigate("request_detail", `Open request: ${item.title}`, undefined, item.id)
    };
  }

  private async navigateTo(context: AgentToolContext, args: Record<string, unknown>) {
    const target = typeof args.target === "string" ? args.target : "";
    if (target === "dashboard") return { uiAction: this.navigate("dashboard", "Open workspace overview") };
    if (target === "requests") {
      const status = this.optionalEnum(args.status, workflowStatuses, "status");
      const priority = this.optionalEnum(args.priority, workflowPriorities, "priority");
      return { uiAction: this.navigate("requests", "Open customer request queue", { ...(status ? { status } : {}), ...(priority ? { priority } : {}) }) };
    }
    if (target === "request_detail") {
      const workflowItemId = typeof args.workflowItemId === "string" ? args.workflowItemId : "";
      if (!workflowItemId) throw new BadRequestException("workflowItemId is required for request_detail navigation");
      const item = await this.prisma.workflowItem.findFirst({
        where: { id: workflowItemId, organizationId: context.organizationId, ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}) },
        select: { id: true, title: true }
      });
      if (!item) throw new NotFoundException("Workflow item not found");
      return { uiAction: this.navigate("request_detail", `Open request: ${item.title}`, undefined, item.id) };
    }
    throw new BadRequestException("target must be dashboard, requests, or request_detail");
  }

  private optionalEnum(value: unknown, allowed: Set<string>, label: string) {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || !allowed.has(value.toUpperCase())) {
      throw new BadRequestException(`${label} is invalid`);
    }
    return value.toUpperCase();
  }

  private limit(value: unknown) {
    if (value === undefined) return 20;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 50) {
      throw new BadRequestException("limit must be an integer from 1 to 50");
    }
    return value;
  }

  private navigate(
    target: AgentUiAction["target"],
    label: string,
    filters?: AgentUiAction["filters"],
    workflowItemId?: string
  ): AgentUiAction {
    return { type: "navigate", target, label, ...(filters && Object.keys(filters).length ? { filters } : {}), ...(workflowItemId ? { workflowItemId } : {}) };
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
