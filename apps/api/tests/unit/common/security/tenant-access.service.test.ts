import assert from "node:assert/strict";
import { test } from "node:test";
import { TenantAccessService } from "../../../../src/common/security/tenant-access.service";

const activeSession = {
  status: "ACTIVE",
  expiresAt: new Date(Date.now() + 60_000),
  user: { status: "ACTIVE" }
};

function serviceWith(overrides: Record<string, unknown> = {}) {
  const prisma = {
    session: { findUnique: async () => activeSession },
    organization: { findUnique: async () => ({ id: "org-1", slug: "demo-org" }) },
    membership: { findUnique: async () => ({ role: "MEMBER", status: "ACTIVE" }) },
    ...overrides
  };
  return new TenantAccessService(prisma as never);
}

test("requireActiveSession accepts an active session on an active user", async () => {
  assert.equal(await serviceWith().requireActiveSession("session-1"), activeSession);
});

test("requireActiveSession rejects missing, revoked, expired, and disabled-user sessions", async () => {
  const cases: Array<unknown> = [
    null,
    { status: "REVOKED", expiresAt: new Date(Date.now() + 60_000), user: { status: "ACTIVE" } },
    { status: "ACTIVE", expiresAt: new Date(Date.now() - 1), user: { status: "ACTIVE" } },
    { status: "ACTIVE", expiresAt: new Date(Date.now() + 60_000), user: { status: "DISABLED" } }
  ];

  for (const session of cases) {
    const service = serviceWith({ session: { findUnique: async () => session } });
    await assert.rejects(() => service.requireActiveSession("session-1"), /Session is not active/);
  }
});

test("requireMembership returns the organization and membership for an active member", async () => {
  const access = await serviceWith().requireMembership("user-1", "demo-org");
  assert.equal(access.organization.id, "org-1");
  assert.equal(access.membership.role, "MEMBER");
});

test("requireMembership rejects an unknown organization with 404 and a non-member with 403", async () => {
  const missingOrg = serviceWith({ organization: { findUnique: async () => null } });
  await assert.rejects(
    () => missingOrg.requireMembership("user-1", "demo-org"),
    (error: { getStatus?: () => number }) => error.getStatus?.() === 404
  );

  for (const membership of [null, { role: "MEMBER", status: "REMOVED" }]) {
    const service = serviceWith({ membership: { findUnique: async () => membership } });
    await assert.rejects(
      () => service.requireMembership("user-1", "demo-org"),
      (error: { getStatus?: () => number }) => error.getStatus?.() === 403
    );
  }
});

test("requireMembership scopes the membership lookup to the resolved organization and caller", async () => {
  let lookup: any;
  const service = serviceWith({
    membership: {
      findUnique: async (input: any) => {
        lookup = input;
        return { role: "ADMIN", status: "ACTIVE" };
      }
    }
  });

  await service.requireMembership("user-1", "demo-org");
  assert.deepEqual(lookup.where, { organizationId_userId: { organizationId: "org-1", userId: "user-1" } });
});
