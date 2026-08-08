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
    "create_workflow_item",
    "update_workflow_status",
    "add_comment"
  ]);
  await assert.rejects(
    tools.execute("missing_tool", { organizationId: "org-a", userId: "user-a", membershipRole: "MEMBER" }, {}),
    /Unknown agent tool/
  );
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
