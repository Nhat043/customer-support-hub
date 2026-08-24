import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceRealtimeGateway } from "../../../../src/infrastructure/realtime/workspace-realtime.gateway";

test("workspace realtime gateway emits a change only to the organization room", () => {
  const gateway = new WorkspaceRealtimeGateway({} as any, {} as any, {} as any);
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  (gateway as unknown as { server: { to: (room: string) => { emit: (event: string, payload: unknown) => void } } }).server = {
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) })
  };

  const change = {
    organizationId: "org-a",
    workspaceId: "workspace-a",
    workflowItemId: "request-a",
    entity: "workflow_item" as const,
    action: "created" as const
  };
  gateway.publish(change);

  assert.deepEqual(emitted, [{ room: "organization:org-a", event: "workspace.changed", payload: change }]);
});
