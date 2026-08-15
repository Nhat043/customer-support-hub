import test from "node:test";
import assert from "node:assert/strict";
import { ConfigService } from "@nestjs/config";
import { AgentService } from "../../../src/modules/agent/agent.service";
import { AgentProvider } from "../../../src/modules/agent/agent.provider";
import { AgentToolsService } from "../../../src/modules/agent/agent-tools.service";

function createHarness(options: {
  existingRun?: Record<string, unknown> | null;
  provider?: AgentProvider;
  workspace?: Record<string, unknown> | null;
  workflowItem?: Record<string, unknown> | null;
  memories?: Array<Record<string, unknown>>;
  knowledge?: Array<Record<string, unknown>>;
  runs?: Array<Record<string, unknown>>;
  toolError?: Error;
} = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const createdRuns: Array<Record<string, unknown>> = [];
  const hookEvents: string[] = [];
  const metricEvents: string[] = [];
  const memoryEvents: string[] = [];
  const runQueries: Array<Record<string, unknown>> = [];
  const deletedRunQueries: Array<Record<string, unknown>> = [];
  const prisma = {
    agentRun: {
      findUnique: async () => options.existingRun ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const run = { id: "run-1", ...data };
        createdRuns.push(run);
        return run;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return data;
      },
      findMany: async (query: Record<string, unknown>) => {
        runQueries.push(query);
        if ((query.select as Record<string, unknown> | undefined)?.messages) {
          return options.runs ?? [{ startedAt: new Date(), messages: [] }];
        }
        return options.runs ?? [{ id: "run-1", status: "SUCCEEDED" }];
      },
      deleteMany: async (query: Record<string, unknown>) => {
        deletedRunQueries.push(query);
        return { count: 2 };
      }
    },
    agentMessage: {
      create: async () => ({ id: "message-1" })
    },
    workspace: {
      findFirst: async () => options.workspace === undefined ? { id: "workspace-1" } : options.workspace
    },
    session: {
      findFirst: async () => ({ workspaceId: "workspace-1" })
    },
    workflowItem: {
      findFirst: async () => options.workflowItem === undefined ? { id: "item-1" } : options.workflowItem
    }
  } as any;
  const tools = {
    execute: async () => {
      if (options.toolError) throw options.toolError;
      return { item: { id: "item-1" } };
    },
    listDefinitions: () => []
  } as unknown as AgentToolsService;
  const config = new ConfigService({ AI_PROVIDER: "mock", AI_MODEL: "test-model" });
  const metrics = {
    recordAgentRun: (status: string) => metricEvents.push(`run:${status}`),
    recordAgentToolCall: (toolName: string, status: string) => metricEvents.push(`tool:${toolName}:${status}`)
  } as any;
  const memory = {
    retrieve: async () => options.memories ?? [],
    remember: async () => {
      memoryEvents.push("remember");
      return { id: "memory-1" };
    },
    clear: async () => {
      memoryEvents.push("clear");
      return 3;
    },
    list: async () => [{ id: "memory-1" }]
  } as any;
  const knowledge = {
    retrieve: async () => options.knowledge ?? []
  } as any;
  const provider = options.provider ?? {
    complete: async () => ({
      text: "Created",
      toolCall: { name: "create_workflow_item", arguments: { title: "Test item" } }
    })
  };
  const service = new AgentService(prisma, tools, config, metrics, memory, knowledge, provider);

  return { service, updates, createdRuns, hookEvents, metricEvents, memoryEvents, runQueries, deletedRunQueries };
}

test("agent service replays a completed run for the same idempotency key", async () => {
  const { service, createdRuns, hookEvents } = createHarness({
    existingRun: {
      id: "existing-run",
      status: "SUCCEEDED",
      modelName: "test-model",
      outputSummary: "Already completed"
    }
  });

  const result = await service.run("org-1", "user-1", "session-1", "MEMBER", "same-key", {
    message: "create task: duplicate"
  }, {
    onCompleted: (event) => hookEvents.push(`${event.runId}:${event.replayed}`)
  });

  assert.equal(result.replayed, true);
  assert.equal(result.runId, "existing-run");
  assert.deepEqual(createdRuns, []);
  assert.deepEqual(hookEvents, ["existing-run:true"]);
});

test("agent service persists a successful function call and emits lifecycle hooks", async () => {
  const { service, createdRuns, updates, hookEvents, metricEvents, memoryEvents } = createHarness();

  const result = await service.run("org-1", "user-1", "session-1", "MEMBER", "new-key", {
    message: "create task: Test item"
  }, {
    onStarted: (event) => hookEvents.push(`started:${event.runId}`),
    onToolCalled: (event) => hookEvents.push(`called:${event.name}`),
    onToolResult: (event) => hookEvents.push(`result:${event.name}`),
    onCompleted: (event) => hookEvents.push(`completed:${event.runId}`)
  });

  assert.equal(result.runId, "run-1");
  assert.equal(result.toolCall?.name, "create_workflow_item");
  assert.equal(createdRuns[0]?.idempotencyKey, "new-key");
  assert.equal(updates[0]?.status, "SUCCEEDED");
  assert.deepEqual(hookEvents, ["started:run-1", "called:create_workflow_item", "result:create_workflow_item", "completed:run-1"]);
  assert.deepEqual(metricEvents, ["tool:create_workflow_item:SUCCEEDED", "run:SUCCEEDED"]);
  assert.deepEqual(memoryEvents, ["remember"]);
});

test("agent service uses the active session workspace when the client does not select one", async () => {
  const { service, createdRuns } = createHarness({
    provider: { complete: async () => ({ text: "Scoped response" }) }
  });

  await service.run("org-1", "user-1", "session-1", "MEMBER", "session-workspace-key", {
    message: "hello"
  });

  assert.equal(createdRuns[0]?.workspaceId, "workspace-1");
});

test("agent service feeds a tool result back to the provider for a natural final answer", async () => {
  const calls: string[] = [];
  const provider: AgentProvider = {
    complete: async () => ({
      text: "I will check the queue.",
      toolCall: { name: "get_support_queue_summary", arguments: {} },
      continuation: { run: "run-1" }
    }),
    continueAfterTool: async (_input, previous, result) => {
      calls.push(`${previous.toolCall?.name}:${result.item ? "item" : "summary"}`);
      return { text: "There are 2 new requests and 1 overdue request." };
    }
  };
  const { service, metricEvents } = createHarness({ provider });

  const result = await service.run("org-1", "user-1", "session-1", "MEMBER", "multi-step-key", {
    message: "Give me a queue summary"
  });

  assert.equal(result.output, "There are 2 new requests and 1 overdue request.");
  assert.deepEqual(calls, ["get_support_queue_summary:item"]);
  assert.deepEqual(metricEvents, ["tool:get_support_queue_summary:SUCCEEDED", "run:SUCCEEDED"]);
});

test("agent service marks the run failed and emits failure hook", async () => {
  const { service, updates, hookEvents, metricEvents } = createHarness({
    provider: {
      complete: async () => {
        throw new Error("provider unavailable");
      }
    }
  });

  await assert.rejects(
    service.run("org-1", "user-1", "session-1", "MEMBER", "failed-key", { message: "hello" }, {
      onFailed: (event) => hookEvents.push(`${event.runId}:${event.message}`)
    }),
    /provider unavailable/
  );
  assert.equal(updates[0]?.status, "FAILED");
  assert.deepEqual(hookEvents, ["run-1:provider unavailable"]);
  assert.deepEqual(metricEvents, ["run:FAILED"]);
});

test("agent service records a failed tool call before failing the run", async () => {
  const { service, metricEvents, updates } = createHarness({
    toolError: new Error("workflow tool unavailable")
  });

  await assert.rejects(
    service.run("org-1", "user-1", "session-1", "MEMBER", "tool-failed-key", { message: "create a request" }),
    /workflow tool unavailable/
  );

  assert.equal(updates[0]?.status, "FAILED");
  assert.deepEqual(metricEvents, ["tool:create_workflow_item:FAILED", "run:FAILED"]);
});

test("agent service rejects a concurrent replay", async () => {
  const { service } = createHarness({
    existingRun: { id: "running-run", status: "RUNNING", modelName: "test-model", outputSummary: null }
  });
  await assert.rejects(
    service.run("org-1", "user-1", "session-1", "MEMBER", "running-key", { message: "hello" }),
    /still running/
  );
});

test("agent service validates workspace and workflow tenant ownership", async () => {
  const missingWorkspace = createHarness({ workspace: null });
  await assert.rejects(
    missingWorkspace.service.run("org-1", "user-1", undefined, "MEMBER", "workspace-key", {
      message: "hello",
      workspaceId: "workspace-x"
    }),
    /Workspace not found/
  );

  const missingItem = createHarness({ workflowItem: null });
  await assert.rejects(
    missingItem.service.run("org-1", "user-1", undefined, "MEMBER", "item-key", {
      message: "hello",
      workflowItemId: "item-x"
    }),
    /Workflow item not found/
  );
});

test("agent service supports text-only responses and tenant-scoped history", async () => {
  const harness = createHarness({
    provider: { complete: async () => ({ text: "No tool needed" }) }
  });
  const result = await harness.service.run("org-1", "user-1", undefined, "MEMBER", "text-key", {
    message: "hello"
  });
  assert.equal(result.output, "No tool needed");
  assert.equal(harness.updates[0]?.status, "SUCCEEDED");
  assert.equal(harness.service.listTools().provider, "mock");
  assert.deepEqual(await harness.service.history("org-1", "user-1", "workspace-1"), [
    { id: "run-1", status: "SUCCEEDED" }
  ]);
});

test("agent service returns only persisted user and assistant messages for private conversation history", async () => {
  const harness = createHarness({
    runs: [{
      id: "run-1",
      startedAt: new Date("2026-08-10T10:00:00.000Z"),
      messages: [
        { id: "message-user", role: "USER", content: { text: "Are there new requests?" }, createdAt: new Date("2026-08-10T10:00:01.000Z") },
        { id: "message-tool", role: "AGENT", content: { type: "tool_result", result: { count: 2 } }, createdAt: new Date("2026-08-10T10:00:02.000Z") },
        { id: "message-assistant", role: "ASSISTANT", content: { text: "There are 2 new requests." }, createdAt: new Date("2026-08-10T10:00:03.000Z") }
      ]
    }]
  });

  assert.deepEqual(await harness.service.conversation("org-1", "user-1"), [
    { id: "message-user", runId: "run-1", role: "user", text: "Are there new requests?", createdAt: new Date("2026-08-10T10:00:01.000Z") },
    { id: "message-assistant", runId: "run-1", role: "assistant", text: "There are 2 new requests.", createdAt: new Date("2026-08-10T10:00:03.000Z") }
  ]);
  assert.deepEqual((harness.runQueries[0]?.where as Record<string, unknown>), {
    organizationId: "org-1",
    userId: "user-1"
  });
});

test("agent service clears only the authenticated user's workspace conversation and memory", async () => {
  const harness = createHarness();

  const result = await harness.service.clearConversation("org-1", "user-1", "workspace-1");

  assert.deepEqual(result, { deletedRuns: 2, deletedMemoryCount: 3 });
  assert.deepEqual(harness.deletedRunQueries, [{
    where: { organizationId: "org-1", userId: "user-1", workspaceId: "workspace-1" }
  }]);
  assert.deepEqual(harness.memoryEvents, ["clear"]);
});

test("agent service handles a completed replay without an output summary", async () => {
  const { service } = createHarness({
    existingRun: { id: "empty-run", status: "FAILED", modelName: "test-model", outputSummary: null }
  });
  const result = await service.run("org-1", "user-1", undefined, "MEMBER", "empty-key", { message: "hello" });
  assert.equal(result.output, "");
});

test("agent service accepts a workflow item within an explicitly selected workspace", async () => {
  const harness = createHarness({
    provider: { complete: async () => ({ text: "Scoped response" }) }
  });
  const result = await harness.service.run("org-1", "user-1", "session-1", "MEMBER", "scoped-key", {
    message: "hello",
    workspaceId: "workspace-1",
    workflowItemId: "item-1"
  });

  assert.equal(result.output, "Scoped response");
  assert.equal(harness.createdRuns[0]?.workspaceId, "workspace-1");
  assert.equal(harness.createdRuns[0]?.workflowItemId, "item-1");
});

test("agent service passes retrieved memory and private conversation context to the provider", async () => {
  let receivedMemory: unknown;
  let receivedConversation: unknown;
  const harness = createHarness({
    memories: [{ id: "memory-1", text: "Prior decision", score: 0.9, sourceType: "agent_run" }],
    runs: [{
      startedAt: new Date("2026-08-10T10:00:00.000Z"),
      messages: [
        { role: "USER", content: { text: "Are there any new requests?" }, createdAt: new Date("2026-08-10T10:00:01.000Z") },
        { role: "ASSISTANT", content: { text: "There is 1 new request." }, createdAt: new Date("2026-08-10T10:00:02.000Z") }
      ]
    }],
    provider: {
      complete: async (input) => {
        receivedMemory = input.memory;
        receivedConversation = input.conversation;
        return { text: "Memory-aware response" };
      }
    }
  });
  const result = await harness.service.run("org-1", "user-1", undefined, "MEMBER", "memory-key", { message: "hello" });
  assert.equal(result.memoryCount, 1);
  assert.deepEqual(receivedMemory, [{ id: "memory-1", text: "Prior decision", score: 0.9, sourceType: "agent_run" }]);
  assert.deepEqual(receivedConversation, [
    { role: "user", text: "Are there any new requests?" },
    { role: "assistant", text: "There is 1 new request." }
  ]);
  assert.deepEqual(await harness.service.memoryHistory("org-1", "user-1"), [{ id: "memory-1" }]);
});

test("agent service passes workspace knowledge to the provider and returns source citations", async () => {
  let receivedKnowledge: unknown;
  const citation = {
    chunkId: "chunk-1",
    documentId: "document-1",
    title: "Refund policy",
    fileName: "refund-policy.md",
    excerpt: "Refunds are reviewed within five business days.",
    score: 0.91
  };
  const harness = createHarness({
    knowledge: [citation],
    provider: {
      complete: async (input) => {
        receivedKnowledge = input.knowledge;
        return { text: "Refunds are reviewed within five business days." };
      }
    }
  });

  const result = await harness.service.run("org-1", "user-1", "session-1", "MEMBER", "knowledge-key", {
    message: "How long does a refund take?"
  });

  assert.deepEqual(receivedKnowledge, [citation]);
  assert.deepEqual(result.citations, [citation]);
});

test("agent service does not attach knowledge citations to a tool-backed request answer", async () => {
  const citation = {
    chunkId: "chunk-1",
    documentId: "document-1",
    title: "Delivery policy",
    fileName: "delivery-policy.md",
    excerpt: "Delivery policy excerpt.",
    score: 0.91
  };
  const harness = createHarness({ knowledge: [citation] });

  const result = await harness.service.run("org-1", "user-1", "session-1", "MEMBER", "tool-citation-key", {
    message: "Create a request"
  });

  assert.deepEqual(result.citations, []);
});
