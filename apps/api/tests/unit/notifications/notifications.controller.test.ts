import assert from "node:assert/strict";
import test from "node:test";
import { NotificationsController } from "../../../src/modules/notifications/notifications.controller";
import { NotificationsService } from "../../../src/modules/notifications/notifications.service";

const organization = { id: "org-1" } as never;
const user = { userId: "user-1", sessionId: "session-1" } as never;

function createService() {
  const calls: any[] = [];
  const prisma = {
    notification: {
      findMany: async (input: any) => { calls.push(input); return []; },
      updateMany: async (input: any) => { calls.push(input); return { count: 1 }; }
    }
  };
  return { service: new NotificationsService(prisma as never), calls };
}

test("notification controller scopes list and read updates to the active tenant and user", async () => {
  const { service, calls } = createService();
  const controller = new NotificationsController(service);

  await controller.list(organization, user);
  await controller.markRead(organization, user, "notification-1");
  await controller.markAllRead(organization, user);

  assert.deepEqual(calls[0].where, { organizationId: "org-1", userId: "user-1" });
  assert.deepEqual(calls[1].where, { id: "notification-1", organizationId: "org-1", userId: "user-1", readAt: null });
  assert.deepEqual(calls[2].where, { organizationId: "org-1", userId: "user-1", readAt: null });
});

test("notification service reports whether a single read actually matched", async () => {
  const { service } = createService();
  assert.deepEqual(await service.markRead("org-1", "user-1", "notification-1"), { ok: true, updated: true });
  assert.deepEqual(await service.markAllRead("org-1", "user-1"), { ok: true, updated: 1 });
});
