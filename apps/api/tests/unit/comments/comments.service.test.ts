import assert from "node:assert/strict";
import test from "node:test";
import { CommentsService } from "../../../src/modules/comments/comments.service";

test("comment creates one collaboration event for a non-actor request owner", async () => {
  const outboxEvents: any[] = [];
  const prisma = {
    workflowItem: { findFirst: async () => ({ id: "item-1", workspaceId: "workspace-1", ownerId: "owner-1", createdById: "owner-1", title: "Delivery delay" }) },
    $transaction: async (callback: any) => callback({
      comment: { create: async () => ({ id: "comment-1", authorUser: { fullName: "Member" } }) },
      workflowEvent: { create: async () => ({}) },
      outboxEvent: { create: async (input: any) => { outboxEvents.push(input); return {}; } }
    })
  };
  const service = new CommentsService(prisma as any);

  await service.create("org-1", "item-1", "member-1", { body: "Carrier has been contacted." });

  assert.deepEqual(outboxEvents[0].data.payload.recipientIds, ["owner-1"]);
  assert.equal(outboxEvents[0].data.type, "request.comment_added");
});

test("comment does not create a self-notification event", async () => {
  let outboxCalled = false;
  const prisma = {
    workflowItem: { findFirst: async () => ({ id: "item-1", workspaceId: "workspace-1", ownerId: "owner-1", createdById: "owner-1", title: "Delivery delay" }) },
    $transaction: async (callback: any) => callback({
      comment: { create: async () => ({ id: "comment-1", authorUser: { fullName: "Owner" } }) },
      workflowEvent: { create: async () => ({}) },
      outboxEvent: { create: async () => { outboxCalled = true; return {}; } }
    })
  };
  const service = new CommentsService(prisma as any);

  await service.create("org-1", "item-1", "owner-1", { body: "I am reviewing this." });

  assert.equal(outboxCalled, false);
});
