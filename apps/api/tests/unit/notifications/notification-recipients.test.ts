import assert from "node:assert/strict";
import test from "node:test";
import { notificationRecipients } from "../../../src/modules/notifications/notification-recipients";

test("notification recipients are unique and never include the actor", () => {
  assert.deepEqual(
    notificationRecipients("member-1", "owner-1", "member-1", "owner-1", null, undefined),
    ["owner-1"]
  );
});
