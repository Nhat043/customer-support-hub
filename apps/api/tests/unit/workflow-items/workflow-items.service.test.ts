import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowItemsService } from "../../../src/modules/workflow-items/workflow-items.service";

const currentItem = {
  id: "item-1",
  organizationId: "org-1",
  workspaceId: null,
  title: "Refund request",
  description: null,
  status: "NEW",
  priority: "MEDIUM",
  ownerId: null,
  dueAt: null,
  closedAt: null,
  owner: null,
  createdBy: { id: "owner-1", fullName: "Owner", email: "owner@example.com" },
  comments: [],
  attachments: [],
  events: []
};

test("create attaches a customer request and audit event to the active workspace", async () => {
  const calls: { item?: any; event?: any } = {};
  const prisma = {
    workspace: { findFirst: async () => ({ id: "workspace-general" }) },
    $transaction: async (callback: any) => callback({
      workflowItem: {
        create: async ({ data }: any) => {
          calls.item = data;
          return { id: "item-1", title: data.title };
        }
      },
      workflowEvent: {
        create: async ({ data }: any) => {
          calls.event = data;
          return data;
        }
      }
    })
  };
  const service = new WorkflowItemsService(prisma as any);

  await service.create("org-1", "owner-1", { title: "Delivery delay" });

  assert.equal(calls.item.workspaceId, "workspace-general");
  assert.equal(calls.event.workspaceId, "workspace-general");
  assert.equal(calls.event.eventType, "CREATED");
});

test("list resolves the active workspace and never returns another workspace's requests", async () => {
  let query: any;
  const prisma = {
    workspace: { findFirst: async () => ({ id: "workspace-general" }) },
    workflowItem: {
      findMany: async (args: any) => {
        query = args;
        return [];
      }
    }
  };
  const service = new WorkflowItemsService(prisma as any);

  await service.list("org-1");

  assert.deepEqual(query.where, {
    organizationId: "org-1",
    workspaceId: "workspace-general"
  });
});

test("member cannot assign a customer request", async () => {
  const prisma = { workflowItem: { findFirst: async () => currentItem } };
  const service = new WorkflowItemsService(prisma as any);

  await assert.rejects(
    () => service.update("org-1", "item-1", { ownerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, { userId: "member-1", role: "MEMBER" }),
    /Only workspace owners and admins/
  );
});

test("owner assigns an active team member and deadline with an assignment event", async () => {
  const calls: { update?: any; event?: any } = {};
  const prisma = {
    workflowItem: { findFirst: async () => currentItem },
    membership: { findFirst: async () => ({ id: "membership-1" }) },
    $transaction: async (callback: any) => callback({
      workflowItem: { update: async ({ data }: any) => { calls.update = data; return { ...currentItem, ...data, updatedAt: new Date() }; } },
      workflowEvent: { create: async ({ data }: any) => { calls.event = data; return data; } },
      outboxEvent: { create: async () => ({ id: "outbox-1" }) }
    })
  };
  const service = new WorkflowItemsService(prisma as any);
  const dueAt = "2026-08-12T09:00:00.000Z";

  await service.update("org-1", "item-1", { ownerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", dueAt }, { userId: "owner-1", role: "OWNER" });

  assert.equal(calls.update.ownerId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(calls.update.dueAt.toISOString(), dueAt);
  assert.equal(calls.event.eventType, "ASSIGNED");
  assert.equal(calls.event.actorUserId, "owner-1");
});

test("owner cannot assign a viewer or user outside the organization", async () => {
  const prisma = {
    workflowItem: { findFirst: async () => currentItem },
    membership: { findFirst: async () => null }
  };
  const service = new WorkflowItemsService(prisma as any);

  await assert.rejects(
    () => service.update("org-1", "item-1", { ownerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, { userId: "owner-1", role: "OWNER" }),
    /Assignee must be an active Owner, Admin, or Member/
  );
});
