import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { AuthService } from "../../../src/modules/auth/auth.service";

const pepper = "refresh-token-pepper-that-is-long-enough-for-tests";

function hashToken(token: string) {
  return createHmac("sha256", pepper).update(token).digest("hex");
}

function createHarness(
  options: {
    tokenStatus?: string;
    userStatus?: string;
    tokenUpdateCount?: number;
    expiresAt?: Date;
    absoluteExpiresAt?: Date;
  } = {},
) {
  const now = new Date(Date.now() + 60 * 60 * 1000);
  const calls: Record<string, unknown[]> = {
    sessionUpdate: [],
    sessionUpdateMany: [],
    refreshTokenCreate: [],
    refreshTokenUpdateMany: [],
    userUpdate: [],
  };
  const session = {
    id: "session-1",
    userId: "user-1",
    organizationId: "org-1",
    status: "ACTIVE",
    expiresAt: options.expiresAt ?? now,
    absoluteExpiresAt:
      options.absoluteExpiresAt ?? new Date(now.getTime() + 60 * 60 * 1000),
    user: {
      id: "user-1",
      email: "user@example.com",
      fullName: "Test User",
      status: options.userStatus ?? "ACTIVE",
    },
    organization: { slug: "test-org" },
  };
  const token = {
    id: "token-1",
    sessionId: "session-1",
    tokenHash: hashToken("refresh-1"),
    status: options.tokenStatus ?? "ACTIVE",
    expiresAt: now,
  };
  const tx = {
    session: {
      findUnique: async () => session,
      findMany: async () => [{ id: "session-1" }, { id: "session-2" }],
      update: async (args: unknown) => {
        calls.sessionUpdate.push(args);
        return session;
      },
      updateMany: async (args: unknown) => {
        calls.sessionUpdateMany.push(args);
        return { count: 1 };
      },
      create: async () => session,
    },
    refreshToken: {
      findUnique: async () => token,
      create: async (args: unknown) => {
        calls.refreshTokenCreate.push(args);
        return token;
      },
      updateMany: async (args: unknown) => {
        calls.refreshTokenUpdateMany.push(args);
        return { count: options.tokenUpdateCount ?? 1 };
      },
    },
    user: {
      update: async (args: unknown) => {
        calls.userUpdate.push(args);
        return { id: "user-1" };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    session: { findUnique: async () => session },
    workspace: { findFirst: async () => ({ id: "workspace-1" }) },
    membership: { findUnique: async () => ({ role: "OWNER" }) },
    user: { findUnique: async () => null, update: tx.user.update },
  };
  const config = {
    get: (key: string) =>
      ({
        ACCESS_TOKEN_TTL: "15m",
        REFRESH_TOKEN_TTL: "30d",
        REFRESH_TOKEN_ABSOLUTE_TTL: "90d",
        REFRESH_TOKEN_PEPPER: pepper,
      })[key as "ACCESS_TOKEN_TTL"],
    getOrThrow: () => "access-token-secret-that-is-long-enough-for-tests",
  };
  const jwt = {
    signAsync: async (payload: { sessionId: string }) =>
      `access-${payload.sessionId}`,
  };

  return {
    service: new AuthService(
      prisma as never,
      jwt as never,
      config as never,
      { sendPasswordResetOtp: async () => ({ sent: true }) } as never,
    ),
    calls,
  };
}

test("refresh rotates an active token and issues a new access token", async () => {
  const { service, calls } = createHarness();

  const result = await service.refresh("session-1", "refresh-1");

  assert.equal(result.accessToken, "access-session-1");
  assert.notEqual(result.refreshToken, "refresh-1");
  assert.equal(calls.refreshTokenUpdateMany.length, 1);
  assert.equal((calls.refreshTokenUpdateMany[0] as any).data.status, "USED");
  assert.equal(calls.refreshTokenCreate.length, 1);
  assert.equal(
    (calls.sessionUpdate[0] as any).data.refreshTokenHash.length,
    64,
  );
});

test("refresh token reuse revokes the server session", async () => {
  const { service, calls } = createHarness({ tokenStatus: "USED" });

  await assert.rejects(
    () => service.refresh("session-1", "refresh-1"),
    (error: UnauthorizedException) => error.getStatus() === 401,
  );

  assert.equal((calls.sessionUpdateMany[0] as any).data.status, "REVOKED");
  assert.equal((calls.refreshTokenUpdateMany[0] as any).data.status, "REVOKED");
});

test("a concurrent refresh loser revokes the session", async () => {
  const { service, calls } = createHarness({ tokenUpdateCount: 0 });

  await assert.rejects(
    () => service.refresh("session-1", "refresh-1"),
    /reuse detected/,
  );

  assert.equal((calls.sessionUpdateMany[0] as any).data.status, "REVOKED");
});

test("logout all revokes every active session and refresh token for a user", async () => {
  const { service, calls } = createHarness();

  await service.logoutAll("user-1");

  assert.deepEqual((calls.sessionUpdateMany[0] as any).where.id.in, [
    "session-1",
    "session-2",
  ]);
  assert.equal((calls.refreshTokenUpdateMany[0] as any).data.status, "REVOKED");
});

test("deactivate disables the user and revokes all sessions", async () => {
  const { service, calls } = createHarness();

  await service.deactivateUser("user-1");

  assert.equal((calls.userUpdate[0] as any).data.status, "DISABLED");
  assert.equal((calls.sessionUpdateMany[0] as any).data.status, "REVOKED");
});

test("expired session is marked expired instead of being refreshed", async () => {
  const { service, calls } = createHarness({
    expiresAt: new Date(Date.now() - 1_000),
  });

  await assert.rejects(
    () => service.refresh("session-1", "refresh-1"),
    /Session is not active/,
  );

  assert.equal((calls.sessionUpdateMany[0] as any).data.status, "EXPIRED");
  assert.equal((calls.refreshTokenUpdateMany[0] as any).data.status, "EXPIRED");
});

test("login rejects disabled users before creating a session", async () => {
  const prisma = {
    user: {
      findUnique: async () => ({
        id: "user-1",
        status: "DISABLED",
        passwordHash: "not-used",
        memberships: [],
      }),
    },
  };
  const service = new AuthService(
    prisma as never,
    { signAsync: async () => "access" } as never,
    { get: () => undefined, getOrThrow: () => "secret" } as never,
    { sendPasswordResetOtp: async () => ({ sent: true }) } as never,
  );

  await assert.rejects(
    () =>
      service.login({ email: "user@example.com", password: "Password123!" }),
    /Invalid credentials/,
  );
});

test("register creates an organization, a session, and a hashed refresh token", async () => {
  const calls: Record<string, unknown[]> = {
    membershipCreate: [],
    workspaceCreate: [],
    refreshTokenCreate: [],
  };
  const createdSession = {
    id: "session-1",
    userId: "user-1",
    organizationId: "org-1",
  };
  const tx = {
    user: { create: async () => ({ id: "user-1" }) },
    organization: { create: async () => ({ id: "org-1", slug: "test-org" }) },
    membership: {
      create: async (args: unknown) => {
        calls.membershipCreate.push(args);
      },
    },
    workspace: {
      create: async (args: unknown) => {
        calls.workspaceCreate.push(args);
      },
    },
    session: { create: async () => createdSession },
    refreshToken: {
      create: async (args: unknown) => {
        calls.refreshTokenCreate.push(args);
      },
    },
  };
  const prisma = {
    user: { findUnique: async () => null },
    workspace: { findFirst: async () => ({ id: "workspace-1" }) },
    session: {
      findUnique: async () => ({
        ...createdSession,
        user: {
          id: "user-1",
          email: "user@example.com",
          fullName: "Test User",
        },
      }),
    },
    $transaction: async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
  };
  const service = new AuthService(
    prisma as never,
    { signAsync: async () => "access-token" } as never,
    {
      get: (key: string) =>
        ({
          REFRESH_TOKEN_PEPPER: pepper,
          REFRESH_TOKEN_TTL: "30d",
          REFRESH_TOKEN_ABSOLUTE_TTL: "90d",
        })[key as "REFRESH_TOKEN_PEPPER"],
      getOrThrow: () => "access-secret",
    } as never,
    { sendPasswordResetOtp: async () => ({ sent: true }) } as never,
  );

  const result = await service.register({
    email: "user@example.com",
    password: "Password123!",
    fullName: "Test User",
    organizationName: "Test Org",
  });

  assert.equal(result.accessToken, "access-token");
  assert.equal((calls.membershipCreate[0] as any).data.role, "OWNER");
  assert.equal((calls.workspaceCreate[0] as any).data.slug, "general");
  assert.equal((calls.refreshTokenCreate[0] as any).data.tokenHash.length, 64);
});

test("login creates a session for an active user", async () => {
  const passwordHash = await bcrypt.hash("Password123!", 4);
  const createdSession = {
    id: "session-1",
    userId: "user-1",
    organizationId: "org-1",
  };
  const tx = {
    session: { create: async () => createdSession },
    refreshToken: { create: async () => undefined },
  };
  const prisma = {
    user: {
      findUnique: async () => ({
        id: "user-1",
        email: "user@example.com",
        fullName: "Test User",
        passwordHash,
        status: "ACTIVE",
        memberships: [
          { organizationId: "org-1", role: "OWNER", organization: { slug: "test-org" } },
        ],
      }),
      update: async () => undefined,
    },
    session: {
      findUnique: async () => ({
        ...createdSession,
        user: {
          id: "user-1",
          email: "user@example.com",
          fullName: "Test User",
        },
      }),
    },
    workspace: { findFirst: async () => ({ id: "workspace-1" }) },
    $transaction: async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
  };
  const service = new AuthService(
    prisma as never,
    { signAsync: async () => "access-token" } as never,
    {
      get: (key: string) =>
        ({
          REFRESH_TOKEN_PEPPER: pepper,
          REFRESH_TOKEN_TTL: "30d",
          REFRESH_TOKEN_ABSOLUTE_TTL: "90d",
        })[key as "REFRESH_TOKEN_PEPPER"],
      getOrThrow: () => "access-secret",
    } as never,
    { sendPasswordResetOtp: async () => ({ sent: true }) } as never,
  );

  const result = await service.login({
    email: "user@example.com",
    password: "Password123!",
  });

  assert.equal(result.session.id, "session-1");
  assert.equal(result.activeOrganizationSlug, "test-org");
});
