import test from "node:test";
import assert from "node:assert/strict";
import { AgentToolsService } from "../../../src/modules/agent/agent-tools.service";

function toolHarness(options: { item?: Record<string, unknown> | null } = {}) {
  const calls: Array<{ model: string; args: unknown }> = [];
  const item = options.item === undefined ? { id: "item-1", workspaceId: "workspace-a" } : options.item;
  const tx = {
    workflowItem: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ model: "workflowItem.create", args: data });
        return { id: "item-created", title: "Created item", status: "NEW", workspaceId: "workspace-a" };
      },
      update: async ({ data }: { data: unknown }) => {
        calls.push({ model: "workflowItem.update", args: data });
        return { id: "item-1", title: "Existing item", status: "CLOSED", workspaceId: "workspace-a" };
      }
    },
    workflowEvent: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ model: "workflowEvent.create", args: data });
        return { id: "event-1" };
      }
    },
    comment: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ model: "comment.create", args: data });
        return { id: "comment-1", body: "hello", workflowItemId: "item-1", createdAt: new Date() };
      }
    }
  };
  const prisma = {
    workflowItem: {
      findMany: async () => [],
      findFirst: async () => item
    },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx)
  } as any;
  return { tools: new AgentToolsService(prisma), calls };
}

test("agent tools always scope workflow listing to the organization", async () => {
  let receivedWhere: unknown;
  const fakePrisma = {
    workflowItem: {
      findMany: async (query: { where: unknown }) => {
        receivedWhere = query.where;
        return [];
      }
    }
  } as any;
  const tools = new AgentToolsService(fakePrisma);

  await tools.execute("list_workflow_items", {
    organizationId: "org-a",
    userId: "user-a",
    membershipRole: "MEMBER",
    workspaceId: "workspace-a"
  }, {});

  assert.deepEqual(receivedWhere, {
    organizationId: "org-a",
    workspaceId: "workspace-a"
  });
});

test("viewer membership cannot execute mutation tools", async () => {
  const tools = new AgentToolsService({} as any);

  await assert.rejects(
    tools.execute("create_workflow_item", {
      organizationId: "org-a",
      userId: "user-a",
      membershipRole: "VIEWER"
    }, { title: "Should be blocked" }),
    /Viewer membership cannot mutate/
  );
});

test("agent tool registry exposes all workflow tools and rejects unknown tools", async () => {
  const { tools } = toolHarness();
  assert.deepEqual(tools.listDefinitions().map((tool) => tool.name), [
    "list_workflow_items",
    "get_workflow_item",
    "get_support_queue_summary",
    "navigate_to",
    "create_workflow_item",
    "update_workflow_status",
    "add_comment"
  ]);
  await assert.rejects(
    tools.execute("missing_tool", { organizationId: "org-a", userId: "user-a", membershipRole: "MEMBER" }, {}),
    /Unknown agent tool/
  );
});

test("request detail tool reads only the selected tenant-owned request and returns safe navigation", async () => {
  let receivedWhere: unknown;
  const tools = new AgentToolsService({
    workflowItem: {
      findFirst: async (query: { where: unknown }) => {
        receivedWhere = query.where;
        return {
          id: "item-1",
          title: "Delayed delivery",
          description: "Order has not arrived.",
          status: "NEW",
          priority: "HIGH",
          dueAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          owner: null,
          comments: []
        };
      }
    }
  } as any);

  const result = await tools.execute("get_workflow_item", {
    organizationId: "org-a", userId: "user-a", membershipRole: "MEMBER", workspaceId: "workspace-a"
  }, { workflowItemId: "item-1" });

  assert.deepEqual(receivedWhere, { id: "item-1", organizationId: "org-a", workspaceId: "workspace-a" });
  assert.equal((result.item as any).description, "Order has not arrived.");
  assert.deepEqual(result.uiAction, {
    type: "navigate", target: "request_detail", label: "Open request: Delayed delivery", workflowItemId: "item-1"
  });
});

test("search tool applies allow-listed filters and returns a safe navigation action", async () => {
  let receivedQuery: Record<string, any> | undefined;
  const tools = new AgentToolsService({
    workflowItem: {
      findMany: async (query: Record<string, any>) => {
        receivedQuery = query;
        return [{ id: "item-1", title: "Refund", status: "NEW", priority: "HIGH", workspaceId: "workspace-a", dueAt: null, owner: null }];
      }
    }
  } as any);

  const result = await tools.execute("list_workflow_items", {
    organizationId: "org-a", userId: "user-a", membershipRole: "MEMBER", workspaceId: "workspace-a"
  }, { status: "new", priority: "high", query: "refund", limit: 10 });

  assert.deepEqual(receivedQuery?.where, {
    organizationId: "org-a",
    workspaceId: "workspace-a",
    status: "NEW",
    priority: "HIGH",
    OR: [{ title: { contains: "refund", mode: "insensitive" } }, { description: { contains: "refund", mode: "insensitive" } }]
  });
  assert.equal(receivedQuery?.take, 10);
  assert.deepEqual(result.uiAction, {
    type: "navigate",
    target: "requests",
    label: "Open 1 matching request",
    filters: { status: "NEW", priority: "HIGH", query: "refund" }
  });
});

test("queue summary calculates operational counts without exposing raw database access", async () => {
  const tools = new AgentToolsService({
    workflowItem: {
      findMany: async (query: { where: { status: unknown } }) => {
        assert.deepEqual(query.where.status, { not: "CLOSED" });
        return [
        { status: "NEW", priority: "HIGH", dueAt: new Date(Date.now() - 1_000), ownerId: null },
          { status: "IN_PROGRESS", priority: "MEDIUM", dueAt: null, ownerId: "user-b" }
        ];
      }
    }
  } as any);

  const result = await tools.execute("get_support_queue_summary", {
    organizationId: "org-a", userId: "user-a", membershipRole: "MEMBER"
  }, {});

  assert.equal(result.openCount, 2);
  assert.equal(result.newCount, 1);
  assert.equal(result.overdueCount, 1);
  assert.equal(result.unassignedCount, 1);
  assert.equal(result.highPriorityCount, 1);
});

test("navigation tool only returns allow-listed destinations and verifies request tenancy", async () => {
  const tools = new AgentToolsService({
    workflowItem: { findFirst: async () => ({ id: "item-1", title: "Refund request" }) }
  } as any);
  const context = { organizationId: "org-a", userId: "user-a", membershipRole: "MEMBER" };

  const requestNavigation = await tools.execute("navigate_to", context, { target: "request_detail", workflowItemId: "item-1" });
  assert.deepEqual(requestNavigation.uiAction, {
    type: "navigate", target: "request_detail", label: "Open request: Refund request", workflowItemId: "item-1"
  });
  await assert.rejects(tools.execute("navigate_to", context, { target: "https://attacker.example" }), /target must be/);
});

test("create workflow tool writes the item and CREATED event", async () => {
  const { tools, calls } = toolHarness();
  const result = await tools.execute("create_workflow_item", {
    organizationId: "org-a",
    userId: "user-a",
    membershipRole: "MEMBER",
    workspaceId: "workspace-a"
  }, { title: "  New item  " });

  assert.equal((result.item as any).id, "item-created");
  assert.equal(calls[0]?.model, "workflowItem.create");
  assert.equal(calls[1]?.model, "workflowEvent.create");
  assert.equal((calls[0]?.args as any).title, "New item");
});

test("mutation tools validate input before touching the database", async () => {
  const { tools } = toolHarness();
  const context = { organizationId: "org-a", userId: "user-a", membershipRole: "MEMBER" };
  await assert.rejects(tools.execute("create_workflow_item", context, { title: " " }), /2-200/);
  await assert.rejects(tools.execute("update_workflow_status", context, { status: "INVALID" }), /valid status/);
  await assert.rejects(tools.execute("add_comment", context, { workflowItemId: "item-1", body: " " }), /comment body/);
});

test("update status tool writes STATUS_CHANGED with closed timestamp", async () => {
  const { tools, calls } = toolHarness();
  const result = await tools.execute("update_workflow_status", {
    organizationId: "org-a",
    userId: "user-a",
    membershipRole: "MEMBER",
    workspaceId: "workspace-a"
  }, { workflowItemId: "item-1", status: "CLOSED" });

  assert.equal((result.item as any).status, "CLOSED");
  assert.equal(calls[0]?.model, "workflowItem.update");
  assert.equal(calls[1]?.model, "workflowEvent.create");
  assert.ok((calls[0]?.args as any).closedAt instanceof Date);
});

test("update and comment tools reject items outside the tenant", async () => {
  const { tools } = toolHarness({ item: null });
  const context = { organizationId: "org-a", userId: "user-a", membershipRole: "MEMBER" };
  await assert.rejects(
    tools.execute("update_workflow_status", context, { workflowItemId: "item-x", status: "NEW" }),
    /Workflow item not found/
  );
  await assert.rejects(
    tools.execute("add_comment", context, { workflowItemId: "item-x", body: "hello" }),
    /Workflow item not found/
  );
});

test("add comment tool writes AGENT comment and COMMENT_ADDED event", async () => {
  const { tools, calls } = toolHarness();
  const result = await tools.execute("add_comment", {
    organizationId: "org-a",
    userId: "user-a",
    membershipRole: "MEMBER"
  }, { workflowItemId: "item-1", body: "  hello  " });

  assert.equal((result.comment as any).id, "comment-1");
  assert.equal(calls[0]?.model, "comment.create");
  assert.equal(calls[1]?.model, "workflowEvent.create");
  assert.equal((calls[0]?.args as any).body, "hello");
  assert.equal((calls[0]?.args as any).authorType, "AGENT");
});
