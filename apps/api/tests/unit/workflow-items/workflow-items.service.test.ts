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
      workflowItem: { update: async ({ data }: any) => { calls.update = data; return { ...currentItem, ...data }; } },
      workflowEvent: { create: async ({ data }: any) => { calls.event = data; return data; } }
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
