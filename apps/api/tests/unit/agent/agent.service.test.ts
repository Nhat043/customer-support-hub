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
} = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const createdRuns: Array<Record<string, unknown>> = [];
  const hookEvents: string[] = [];
  const metricEvents: string[] = [];
  const memoryEvents: string[] = [];
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
      findMany: async () => [{ id: "run-1", status: "SUCCEEDED" }]
    },
    agentMessage: {
      create: async () => ({ id: "message-1" })
    },
    workspace: {
      findFirst: async () => options.workspace === undefined ? { id: "workspace-1" } : options.workspace
    },
    workflowItem: {
      findFirst: async () => options.workflowItem === undefined ? { id: "item-1" } : options.workflowItem
    }
  } as any;
  const tools = {
    execute: async () => ({ item: { id: "item-1" } }),
    listDefinitions: () => []
  } as unknown as AgentToolsService;
  const config = new ConfigService({ AI_PROVIDER: "mock", AI_MODEL: "test-model" });
  const metrics = {
    recordAgentRun: (status: string) => metricEvents.push(`run:${status}`),
    recordAgentToolCall: (toolName: string) => metricEvents.push(`tool:${toolName}`)
  } as any;
  const memory = {
    retrieve: async () => options.memories ?? [],
    remember: async () => {
      memoryEvents.push("remember");
      return { id: "memory-1" };
    },
    list: async () => [{ id: "memory-1" }]
  } as any;
  const provider = options.provider ?? {
    complete: async () => ({
      text: "Created",
      toolCall: { name: "create_workflow_item", arguments: { title: "Test item" } }
    })
  };
  const service = new AgentService(prisma, tools, config, metrics, memory, provider);

  return { service, updates, createdRuns, hookEvents, metricEvents, memoryEvents };
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
  assert.deepEqual(metricEvents, ["tool:create_workflow_item", "run:SUCCEEDED"]);
  assert.deepEqual(memoryEvents, ["remember"]);
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
  assert.deepEqual(metricEvents, ["tool:get_support_queue_summary", "run:SUCCEEDED"]);
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
  assert.deepEqual(await harness.service.history("org-1", "workspace-1"), [
    { id: "run-1", status: "SUCCEEDED" }
  ]);
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

test("agent service passes retrieved tenant memory to the provider", async () => {
  let receivedMemory: unknown;
  const harness = createHarness({
    memories: [{ id: "memory-1", text: "Prior decision", score: 0.9, sourceType: "agent_run" }],
    provider: {
      complete: async (input) => {
        receivedMemory = input.memory;
        return { text: "Memory-aware response" };
      }
    }
  });
  const result = await harness.service.run("org-1", "user-1", undefined, "MEMBER", "memory-key", { message: "hello" });
  assert.equal(result.memoryCount, 1);
  assert.deepEqual(receivedMemory, [{ id: "memory-1", text: "Prior decision", score: 0.9, sourceType: "agent_run" }]);
  assert.deepEqual(await harness.service.memoryHistory("org-1", "user-1"), [{ id: "memory-1" }]);
});
