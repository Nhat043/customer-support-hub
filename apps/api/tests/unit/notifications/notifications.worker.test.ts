import assert from "node:assert/strict";
import test from "node:test";
import { NotificationsWorker } from "../../../src/modules/notifications/notifications.worker";

test("worker creates one SLA event per request deadline", async () => {
  const calls: any[] = [];
  const prisma = {
    workflowItem: { findMany: async () => [{ id: "item-1", organizationId: "org-1", ownerId: "user-1", title: "Refund", dueAt: new Date(Date.now() + 3_600_000), status: "NEW" }] },
    outboxEvent: { createMany: async (input: any) => { calls.push(input); return { count: 1 }; }, findMany: async () => [] }
  };
  const worker = new NotificationsWorker(prisma as any, {} as any);
  await worker.processPending();
  assert.equal(calls[0].data[0].type, "request.sla_due_soon");
  assert.equal(calls[0].data[0].payload.notificationType, "SLA_DUE_SOON");
  assert.equal(calls[0].skipDuplicates, true);
});

test("worker delivers an assignment event once and creates an in-app notification", async () => {
  const updates: any[] = [];
  const event = { id: "event-1", organizationId: "org-1", type: "request.assigned", attempts: 0, payload: { workflowItemId: "item-1", assigneeId: "user-1", title: "Refund" } };
  const prisma = {
    workflowItem: { findMany: async () => [] },
    outboxEvent: { createMany: async () => ({ count: 0 }), findMany: async () => [event], updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => event, update: async (input: any) => { updates.push(input); return input; } },
    user: { findUniqueOrThrow: async () => ({ email: "member@example.com" }) },
    notification: { upsert: async () => ({}) }
  };
  const worker = new NotificationsWorker(prisma as any, { isEnabled: () => false } as any);
  await worker.processPending();
  assert.equal(updates.at(-1).data.status, "DELIVERED");
});

test("worker retries a failed email delivery with backoff", async () => {
  const updates: any[] = [];
  const event = { id: "event-1", organizationId: "org-1", type: "request.assigned", attempts: 1, payload: { workflowItemId: "item-1", assigneeId: "user-1", title: "Refund" } };
  const prisma = {
    workflowItem: { findMany: async () => [] },
    outboxEvent: { createMany: async () => ({ count: 0 }), findMany: async () => [event], updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => event, update: async (input: any) => { updates.push(input); return input; } },
    user: { findUniqueOrThrow: async () => ({ email: "member@example.com" }) },
    notification: { upsert: async () => ({}) }
  };
  const worker = new NotificationsWorker(prisma as any, { isEnabled: () => true, sendRequestAssigned: async () => ({ sent: false }) } as any);
  await worker.processPending();
  assert.equal(updates.at(-1).data.status, "FAILED");
  assert.equal(updates.at(-1).data.lastError, "Email delivery failed");
});
