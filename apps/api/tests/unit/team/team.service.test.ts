import assert from "node:assert/strict";
import test from "node:test";
import { TeamService } from "../../../src/modules/team/team.service";

const organization = { id: "org-1", slug: "acme", name: "Acme Store" };

test("TeamService creates a single-use invitation token without storing the raw token", async () => {
  const calls: { invitation?: any; audit?: any } = {};
  const prisma = {
    user: { findUnique: async () => null },
    $transaction: async (callback: any) =>
      callback({
        invitation: {
          updateMany: async () => ({ count: 0 }),
          create: async ({ data }: any) => {
            calls.invitation = data;
            return { id: "invite-1", ...data };
          },
        },
        auditLog: {
          create: async ({ data }: any) => {
            calls.audit = data;
            return data;
          },
        },
      }),
  };
  const service = new TeamService(prisma as any);

  const result = await service.createInvitation({
    organizationId: "org-1",
    invitedById: "owner-1",
    inviterRole: "OWNER",
    email: " Teammate@Example.com ",
    role: "MEMBER",
  });

  assert.equal(result.email, "teammate@example.com");
  assert.equal(result.role, "MEMBER");
  assert.equal(result.token.length > 32, true);
  assert.notEqual(calls.invitation.tokenHash, result.token);
  assert.equal(calls.audit.action, "TEAM_INVITATION_CREATED");
});

test("TeamService accepts an invitation into an active membership", async () => {
  const invitation = {
    id: "invite-1",
    organizationId: "org-1",
    email: "teammate@example.com",
    role: "MEMBER",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60_000),
    organization,
  };
  const prisma = {
    invitation: {
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => invitation,
    },
    $transaction: async (callback: any) =>
      callback({
        membership: {
          findUnique: async () => null,
          upsert: async ({ create }: any) => ({ id: "membership-1", ...create }),
        },
        invitation: { update: async () => invitation },
        session: { updateMany: async () => ({ count: 1 }) },
        auditLog: { create: async () => ({}) },
      }),
  };
  const service = new TeamService(prisma as any);

  const accepted = await service.acceptInvitation({
    token: "a".repeat(43),
    userId: "user-1",
    email: "teammate@example.com",
    sessionId: "session-1",
  });

  assert.equal(accepted.organization.slug, "acme");
  assert.equal(accepted.membership.role, "MEMBER");
  assert.equal(accepted.membership.status, "ACTIVE");
});
