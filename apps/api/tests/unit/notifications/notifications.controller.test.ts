import assert from "node:assert/strict";
import test from "node:test";
import { NotificationsController } from "../../../src/modules/notifications/notifications.controller";

const request = { organization: { id: "org-1" }, user: { userId: "user-1" } };

test("notification controller scopes list and read updates to the active tenant and user", async () => {
  const calls: any[] = [];
  const controller = new NotificationsController({
    notification: {
      findMany: async (input: any) => { calls.push(input); return []; },
      updateMany: async (input: any) => { calls.push(input); return { count: 1 }; }
    }
  } as any);

  await controller.list(request);
  await controller.markRead(request, "notification-1");
  await controller.markAllRead(request);

  assert.deepEqual(calls[0].where, { organizationId: "org-1", userId: "user-1" });
  assert.deepEqual(calls[1].where, { id: "notification-1", organizationId: "org-1", userId: "user-1", readAt: null });
  assert.deepEqual(calls[2].where, { organizationId: "org-1", userId: "user-1", readAt: null });
});
