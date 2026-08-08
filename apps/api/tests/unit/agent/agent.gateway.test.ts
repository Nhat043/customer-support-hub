import test from "node:test";
import assert from "node:assert/strict";
import { AgentGateway } from "../../../src/modules/agent/agent.gateway";

function createGatewayHarness() {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    handshake: { auth: { accessToken: "access-token" } },
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
      return true;
    }
  } as any;
  const agentService = {
    run: async (...args: any[]) => {
      const hooks = args[6];
      await hooks.onStarted({ runId: "run-1", modelName: "mock" });
      await hooks.onToolCalled({ runId: "run-1", name: "list_workflow_items", arguments: {} });
      await hooks.onToolResult({ runId: "run-1", name: "list_workflow_items", result: { count: 0 } });
      await hooks.onCompleted({ runId: "run-1", output: "Completed" });
      return { runId: "run-1", output: "Completed" };
    }
  } as any;
  const jwtService = { verify: () => ({ userId: "user-1", sessionId: "session-1" }) } as any;
  const config = { getOrThrow: () => "test-secret" } as any;
  const prisma = {
    session: { findUnique: async () => ({ status: "ACTIVE", expiresAt: new Date(Date.now() + 60_000), user: { status: "ACTIVE" } }) },
    organization: { findUnique: async () => ({ id: "org-1" }) },
    membership: { findUnique: async () => ({ role: "MEMBER", status: "ACTIVE" }) }
  } as any;
  return { gateway: new AgentGateway(agentService, jwtService, config, prisma), socket, emitted, jwtService, prisma };
}

test("gateway emits streaming lifecycle events", async () => {
  const { gateway, socket, emitted } = createGatewayHarness();
  gateway.handleConnection(socket);
  const result = await gateway.run(socket, {
    orgSlug: "demo-org",
    message: "list workflow",
    idempotencyKey: "stream-key"
  });

  assert.deepEqual(emitted.map((item) => item.event), [
    "agent.ready",
    "run.started",
    "tool.called",
    "tool.result",
    "run.completed"
  ]);
  assert.deepEqual(result, { runId: "run-1", output: "Completed" });
});

test("gateway emits run.failed when authentication is missing", async () => {
  const { gateway, socket, emitted } = createGatewayHarness();
  socket.handshake.auth = {};
  const result = await gateway.run(socket, {
    orgSlug: "demo-org",
    message: "hello",
    idempotencyKey: "failed-stream-key"
  });

  assert.deepEqual(result, { accepted: false });
  assert.equal(emitted.at(-1)?.event, "run.failed");
});

test("gateway rejects missing idempotency key and invalid message", async () => {
  const missingKey = createGatewayHarness();
  await missingKey.gateway.run(missingKey.socket, { orgSlug: "demo-org", message: "hello" });
  assert.match(String((missingKey.emitted.at(-1)?.payload as any).message), /Idempotency-Key/);

  const invalidMessage = createGatewayHarness();
  await invalidMessage.gateway.run(invalidMessage.socket, {
    orgSlug: "demo-org",
    message: "   ",
    idempotencyKey: "invalid-message-key"
  });
  assert.match(String((invalidMessage.emitted.at(-1)?.payload as any).message), /valid agent message/);
});

test("gateway rejects invalid token, expired session, organization and membership", async () => {
  const invalidToken = createGatewayHarness();
  invalidToken.jwtService.verify = () => { throw new Error("invalid"); };
  await invalidToken.gateway.run(invalidToken.socket, { orgSlug: "demo-org", message: "hello", idempotencyKey: "invalid-token" });
  assert.match(String((invalidToken.emitted.at(-1)?.payload as any).message), /Invalid access token/);

  const expiredSession = createGatewayHarness();
  expiredSession.prisma.session.findUnique = async () => ({
    status: "ACTIVE",
    expiresAt: new Date(Date.now() - 1),
    user: { status: "ACTIVE" }
  });
  await expiredSession.gateway.run(expiredSession.socket, { orgSlug: "demo-org", message: "hello", idempotencyKey: "expired" });
  assert.match(String((expiredSession.emitted.at(-1)?.payload as any).message), /Session is not active/);

  const missingOrg = createGatewayHarness();
  missingOrg.prisma.organization.findUnique = async () => null;
  await missingOrg.gateway.run(missingOrg.socket, { orgSlug: "demo-org", message: "hello", idempotencyKey: "missing-org" });
  assert.match(String((missingOrg.emitted.at(-1)?.payload as any).message), /Organization not found/);

  const missingMembership = createGatewayHarness();
  missingMembership.prisma.membership.findUnique = async () => null;
  await missingMembership.gateway.run(missingMembership.socket, { orgSlug: "demo-org", message: "hello", idempotencyKey: "missing-membership" });
  assert.match(String((missingMembership.emitted.at(-1)?.payload as any).message), /No organization access/);
});
