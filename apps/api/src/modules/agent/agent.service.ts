import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "../../../node_modules/.prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AGENT_PROVIDER, AgentProvider, AgentRunHooks, AgentUiAction } from "./agent.provider";
import { AgentToolContext, AgentToolsService } from "./agent-tools.service";
import { CreateAgentRunDto } from "./dto/agent.dto";
import { MetricsService } from "../../infrastructure/observability/metrics.service";
import { AgentMemoryService } from "../../infrastructure/memory/agent-memory.service";
import { WorkspaceKnowledgeService } from "../knowledge/knowledge.service";

const MAX_TOOL_STEPS = 3;

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: AgentToolsService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
    private readonly memory: AgentMemoryService,
    private readonly knowledge: WorkspaceKnowledgeService,
    @Inject(AGENT_PROVIDER) private readonly provider: AgentProvider
  ) {}

  async run(
    organizationId: string,
    userId: string,
    sessionId: string | undefined,
    membershipRole: string,
    idempotencyKey: string,
    dto: CreateAgentRunDto,
    hooks: AgentRunHooks = {}
  ) {
    const startedAt = performance.now();
    const existing = await this.prisma.agentRun.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
      select: { id: true, status: true, modelName: true, outputSummary: true }
    });
    if (existing) {
      if (existing.status === "RUNNING") {
        throw new ConflictException("An agent run with this idempotency key is still running");
      }
      await hooks.onCompleted?.({
        runId: existing.id,
        output: existing.outputSummary ?? "",
        replayed: true
      });
      return {
        runId: existing.id,
        modelName: existing.modelName,
        output: existing.outputSummary ?? "",
        toolCall: null,
        toolResult: null,
        memoryCount: 0,
        replayed: true
      };
    }
    const workspaceId = dto.workspaceId ?? await this.activeWorkspaceId(organizationId, userId, sessionId);
    if (workspaceId) {
      const workspace = await this.prisma.workspace.findFirst({
        where: { id: workspaceId, organizationId },
        select: { id: true }
      });
      if (!workspace) throw new NotFoundException("Workspace not found");
    }
    if (dto.workflowItemId) {
      const item = await this.prisma.workflowItem.findFirst({
        where: {
          id: dto.workflowItemId,
          organizationId,
          ...(workspaceId ? { workspaceId } : {})
        },
        select: { id: true }
      });
      if (!item) throw new NotFoundException("Workflow item not found");
    }

    const [conversation, knowledge] = await Promise.all([
      this.recentConversation(organizationId, userId, workspaceId),
      this.knowledge.retrieve(organizationId, workspaceId, dto.message)
    ]);

    const modelName = this.config.get<string>("AI_MODEL", "mock-function-caller");
    const run = await this.prisma.agentRun.create({
      data: {
        organizationId,
        workspaceId,
        userId,
        workflowItemId: dto.workflowItemId,
        sessionId,
        modelName,
        inputSummary: dto.message.slice(0, 500),
        traceToken: randomUUID(),
        idempotencyKey
      }
    });
    await this.prisma.agentMessage.create({
      data: {
        organizationId,
        workspaceId,
        agentRunId: run.id,
        role: "USER",
        content: { text: dto.message } as Prisma.InputJsonValue
      }
    });
    await hooks.onStarted?.({ runId: run.id, modelName });

    try {
      const memories = await this.memory.retrieve({ organizationId, userId, workspaceId }, dto.message);
      const input = { message: dto.message, modelName, memory: memories, knowledge, conversation };
      let decision = await this.provider.complete(input);
      let toolResult: Record<string, unknown> | undefined;
      let uiAction: AgentUiAction | undefined;
      const toolNames: string[] = [];
      for (let step = 0; decision.toolCall && step < MAX_TOOL_STEPS; step += 1) {
        await hooks.onToolCalled?.({
          runId: run.id,
          name: decision.toolCall.name,
          arguments: decision.toolCall.arguments
        });
        this.metrics.recordAgentToolCall(decision.toolCall.name);
        toolNames.push(decision.toolCall.name);
        const context: AgentToolContext = { organizationId, userId, membershipRole, workspaceId };
        toolResult = await this.tools.execute(
          decision.toolCall.name,
          context,
          decision.toolCall.arguments
        );
        uiAction = this.readUiAction(toolResult);
        await this.prisma.agentMessage.create({
          data: {
            organizationId,
            workspaceId,
            agentRunId: run.id,
            role: "AGENT",
            toolName: decision.toolCall.name,
            content: { type: "tool_result", result: toolResult } as Prisma.InputJsonValue
          }
        });
        await hooks.onToolResult?.({ runId: run.id, name: decision.toolCall.name, result: toolResult });

        if (!this.provider.continueAfterTool) break;
        decision = await this.provider.continueAfterTool(input, decision, toolResult);
      }
      const output = decision.toolCall
        ? "I stopped after the safe maximum of three tool steps. Please refine the request if you need another action."
        : decision.text;
      await this.prisma.agentMessage.create({
        data: {
          organizationId,
          workspaceId,
          agentRunId: run.id,
          role: "ASSISTANT",
          content: { text: output, toolCall: decision.toolCall ?? null, citations: knowledge } as Prisma.InputJsonValue
        }
      });
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: { status: "SUCCEEDED", outputSummary: output.slice(0, 2000), finishedAt: new Date() }
      });
      await this.memory.remember({
        organizationId,
        workspaceId,
        userId,
        agentRunId: run.id,
        sourceType: "agent_run",
        sourceId: run.id,
        text: `User: ${dto.message}\nAssistant: ${output}`,
        metadata: { modelName, toolNames }
      });
      this.metrics.recordAgentRun("SUCCEEDED", modelName, (performance.now() - startedAt) / 1_000);
      await hooks.onCompleted?.({ runId: run.id, output, uiAction: uiAction ?? null, citations: knowledge });
      return {
        runId: run.id,
        modelName,
        output,
        toolCall: decision.toolCall ?? null,
        toolResult: toolResult ?? null,
        uiAction: uiAction ?? null,
        citations: knowledge,
        memoryCount: memories.length
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent run failed";
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: { status: "FAILED", outputSummary: message.slice(0, 2000), finishedAt: new Date() }
      });
      this.metrics.recordAgentRun("FAILED", modelName, (performance.now() - startedAt) / 1_000);
      await hooks.onFailed?.({ runId: run.id, message });
      throw error;
    }
  }

  listTools() {
    return { provider: this.config.get<string>("AI_PROVIDER", "mock"), tools: this.tools.listDefinitions() };
  }

  history(organizationId: string, userId: string, workspaceId?: string) {
    return this.prisma.agentRun.findMany({
      where: { organizationId, userId, ...(workspaceId ? { workspaceId } : {}) },
      select: {
        id: true,
        workspaceId: true,
        modelName: true,
        status: true,
        inputSummary: true,
        outputSummary: true,
        startedAt: true,
        finishedAt: true
      },
      orderBy: { startedAt: "desc" },
      take: 50
    });
  }

  async conversation(organizationId: string, userId: string, workspaceId?: string) {
    const runs = await this.prisma.agentRun.findMany({
      where: { organizationId, userId, ...(workspaceId ? { workspaceId } : {}) },
      select: {
        id: true,
        startedAt: true,
        messages: {
          where: { role: { in: ["USER", "ASSISTANT"] } },
          select: { id: true, role: true, content: true, createdAt: true },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { startedAt: "desc" },
      take: 50
    });

    return runs.reverse().flatMap((run) => run.messages.flatMap((message) => {
      const text = this.messageText(message.content);
      if (!text) return [];
      const citations = message.role === "ASSISTANT" ? this.messageCitations(message.content) : [];
      return [{
        id: message.id,
        runId: run.id,
        role: message.role === "USER" ? "user" as const : "assistant" as const,
        text,
        createdAt: message.createdAt,
        ...(citations.length ? { citations } : {})
      }];
    }));
  }

  memoryHistory(organizationId: string, userId: string, workspaceId?: string) {
    return this.memory.list({ organizationId, userId, workspaceId });
  }

  async clearConversation(organizationId: string, userId: string, workspaceId?: string) {
    const where = { organizationId, userId, ...(workspaceId ? { workspaceId } : {}) };
    const deletedMemoryCount = await this.memory.clear(where);
    const deletedRuns = await this.prisma.agentRun.deleteMany({ where });
    return { deletedRuns: deletedRuns.count, deletedMemoryCount };
  }

  private async recentConversation(organizationId: string, userId: string, workspaceId?: string) {
    const runs = await this.prisma.agentRun.findMany({
      where: { organizationId, userId, ...(workspaceId ? { workspaceId } : {}) },
      select: {
        startedAt: true,
        messages: {
          where: { role: { in: ["USER", "ASSISTANT"] } },
          select: { role: true, content: true, createdAt: true },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { startedAt: "desc" },
      take: 5
    });
    return runs.reverse().flatMap((run) => run.messages.flatMap((message) => {
      const text = this.messageText(message.content);
      if (!text) return [];
      return [{ role: message.role === "USER" ? "user" as const : "assistant" as const, text }];
    })).slice(-10);
  }

  private async activeWorkspaceId(organizationId: string, userId: string, sessionId?: string) {
    if (!sessionId) return undefined;
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId, organizationId },
      select: { workspaceId: true }
    });
    return session?.workspaceId ?? undefined;
  }

  private readUiAction(result: Record<string, unknown>): AgentUiAction | undefined {
    const candidate = result.uiAction;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
    const action = candidate as Partial<AgentUiAction>;
    if (action.type !== "navigate" || !action.target || !action.label) return undefined;
    return action as AgentUiAction;
  }

  private messageText(content: Prisma.JsonValue | null) {
    if (!content || typeof content !== "object" || Array.isArray(content)) return undefined;
    const text = (content as { text?: unknown }).text;
    return typeof text === "string" && text.trim() ? text : undefined;
  }

  private messageCitations(content: Prisma.JsonValue | null) {
    if (!content || typeof content !== "object" || Array.isArray(content)) return [];
    const citations = (content as { citations?: unknown }).citations;
    if (!Array.isArray(citations)) return [];
    return citations.filter((citation): citation is {
      chunkId: string;
      documentId: string;
      title: string;
      fileName: string;
      excerpt: string;
      score: number;
    } => Boolean(
      citation && typeof citation === "object" &&
      typeof (citation as { chunkId?: unknown }).chunkId === "string" &&
      typeof (citation as { title?: unknown }).title === "string" &&
      typeof (citation as { fileName?: unknown }).fileName === "string" &&
      typeof (citation as { excerpt?: unknown }).excerpt === "string"
    ));
  }
}
