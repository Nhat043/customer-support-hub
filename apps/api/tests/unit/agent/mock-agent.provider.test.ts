import test from "node:test";
import assert from "node:assert/strict";
import { MockAgentProvider } from "../../../src/modules/agent/mock-agent.provider";

const input = (message: string) => ({ message, modelName: "mock", memory: [] });

test("mock provider emits a create function call", async () => {
  const provider = new MockAgentProvider();
  const decision = await provider.complete(input("create task: Review onboarding flow"));

  assert.equal(decision.toolCall?.name, "create_workflow_item");
  assert.deepEqual(decision.toolCall?.arguments, { title: "Review onboarding flow" });
});

test("mock provider returns text for unsupported intent", async () => {
  const provider = new MockAgentProvider();
  const decision = await provider.complete(input("hello"));

  assert.equal(decision.toolCall, undefined);
  assert.match(decision.text, /Mock agent received/);
});

test("mock provider emits list, status, and comment calls", async () => {
  const provider = new MockAgentProvider();
  const itemId = "123e4567-e89b-12d3-a456-426614174000";

  assert.equal((await provider.complete(input("list workflow"))).toolCall?.name, "list_workflow_items");
  assert.deepEqual(
    (await provider.complete(input(`status ${itemId} CLOSED`))).toolCall,
    { name: "update_workflow_status", arguments: { workflowItemId: itemId, status: "CLOSED" } }
  );
  assert.deepEqual(
    (await provider.complete(input(`comment ${itemId}: Please review`))).toolCall,
    { name: "add_comment", arguments: { workflowItemId: itemId, body: "Please review" } }
  );
});

test("mock provider recognizes localized command aliases", async () => {
  const provider = new MockAgentProvider();
  const itemId = "123e4567-e89b-12d3-a456-426614174000";
  assert.equal((await provider.complete(input("tạo task: Local task"))).toolCall?.name, "create_workflow_item");
  assert.equal((await provider.complete(input("show tasks"))).toolCall?.name, "list_workflow_items");
  assert.equal((await provider.complete(input("liệt kê items"))).toolCall?.name, "list_workflow_items");
  assert.equal((await provider.complete(input(`set status ${itemId} NEW`))).toolCall?.name, "update_workflow_status");
  assert.equal((await provider.complete(input(`đổi trạng thái ${itemId} WAITING`))).toolCall?.name, "update_workflow_status");
  assert.equal((await provider.complete(input(`add comment ${itemId}: Alias comment`))).toolCall?.name, "add_comment");
  assert.equal((await provider.complete(input(`bình luận ${itemId}: Vietnamese comment`))).toolCall?.name, "add_comment");
});

test("mock provider routes operational questions through summary, filters, and navigation tools", async () => {
  const provider = new MockAgentProvider();
  assert.equal((await provider.complete(input("Are there any new requests?"))).toolCall?.name, "list_workflow_items");
  assert.deepEqual((await provider.complete(input("Are there any new requests?"))).toolCall?.arguments, { status: "NEW" });
  assert.equal((await provider.complete(input("Give me a queue summary"))).toolCall?.name, "get_support_queue_summary");
  assert.deepEqual((await provider.complete(input("Open requests"))).toolCall, {
    name: "navigate_to", arguments: { target: "requests" }
  });
});
