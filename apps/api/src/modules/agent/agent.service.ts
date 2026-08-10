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

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: AgentToolsService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
    private readonly memory: AgentMemoryService,
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
    const workspaceId = dto.workspaceId ?? undefined;
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
      const decision = await this.provider.complete({ message: dto.message, modelName, memory: memories });
      let toolResult: Record<string, unknown> | undefined;
      let uiAction: AgentUiAction | undefined;
      if (decision.toolCall) {
        await hooks.onToolCalled?.({
          runId: run.id,
          name: decision.toolCall.name,
          arguments: decision.toolCall.arguments
        });
        this.metrics.recordAgentToolCall(decision.toolCall.name);
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
      }
      const output = toolResult
        ? `${decision.text} Result: ${JSON.stringify(toolResult)}`
        : decision.text;
      await this.prisma.agentMessage.create({
        data: {
          organizationId,
          workspaceId,
          agentRunId: run.id,
          role: "ASSISTANT",
          content: { text: output, toolCall: decision.toolCall ?? null } as Prisma.InputJsonValue
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
        metadata: { modelName, toolName: decision.toolCall?.name ?? null }
      });
      this.metrics.recordAgentRun("SUCCEEDED", modelName, (performance.now() - startedAt) / 1_000);
      await hooks.onCompleted?.({ runId: run.id, output, uiAction: uiAction ?? null });
      return {
        runId: run.id,
        modelName,
        output,
        toolCall: decision.toolCall ?? null,
        toolResult: toolResult ?? null,
        uiAction: uiAction ?? null,
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

  history(organizationId: string, workspaceId?: string) {
    return this.prisma.agentRun.findMany({
      where: { organizationId, ...(workspaceId ? { workspaceId } : {}) },
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

  memoryHistory(organizationId: string, userId: string, workspaceId?: string) {
    return this.memory.list({ organizationId, userId, workspaceId });
  }

  private readUiAction(result: Record<string, unknown>): AgentUiAction | undefined {
    const candidate = result.uiAction;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
    const action = candidate as Partial<AgentUiAction>;
    if (action.type !== "navigate" || !action.target || !action.label) return undefined;
    return action as AgentUiAction;
  }
}
