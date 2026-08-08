import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthController } from "../../../src/modules/auth/auth.controller";

function response() {
  const cookies: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];
  const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
  return {
    cookies,
    cleared,
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookies.push({ name, value, options });
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      cleared.push({ name, options });
    },
  };
}

test("login sets HttpOnly secure refresh and session cookies", async () => {
  const authService = {
    login: async () => ({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      session: { id: "session-1" },
      user: { id: "user-1", email: "user@example.com", fullName: "Test User" },
      activeOrganizationSlug: "test-org",
    }),
  };
  const controller = new AuthController(
    authService as never,
    {
      get: (key: string) =>
        ({ COOKIE_SECURE: "true", COOKIE_DOMAIN: ".example.com" })[key],
    } as never,
  );
  const res = response();

  const body = await controller.login(
    { email: "user@example.com", password: "Password123!" },
    res as never,
  );

  assert.equal(body.accessToken, "access-token");
  assert.equal(res.cookies.length, 2);
  assert.equal(res.cookies[0]?.options.httpOnly, true);
  assert.equal(res.cookies[0]?.options.secure, true);
  assert.equal(res.cookies[0]?.options.sameSite, "lax");
  assert.equal(res.cookies[0]?.options.path, "/api/auth");
});

test("logout all and deactivate clear both HttpOnly cookies", async () => {
  const calls: string[] = [];
  const authService = {
    logoutAll: async () => calls.push("logout-all"),
    deactivateUser: async () => calls.push("deactivate"),
  };
  const controller = new AuthController(
    authService as never,
    {
      get: (key: string) =>
        ({ COOKIE_SECURE: "true", COOKIE_DOMAIN: ".example.com" })[key],
    } as never,
  );
  const logoutRes = response();
  const deactivateRes = response();

  await controller.logoutAll({ userId: "user-1" }, logoutRes as never);
  await controller.deactivate({ userId: "user-1" }, deactivateRes as never);

  assert.deepEqual(calls, ["logout-all", "deactivate"]);
  assert.deepEqual(
    logoutRes.cleared.map((cookie) => cookie.name),
    ["refreshToken", "sessionId"],
  );
  assert.equal(deactivateRes.cleared[0]?.options.secure, true);
});

test("refresh rotates cookies and returns the new access token", async () => {
  const authService = {
    refresh: async (sessionId: string, token: string) => ({
      accessToken: `${sessionId}-${token}-access`,
      refreshToken: "next-refresh-token",
      user: { id: "user-1", email: "user@example.com", fullName: "Test User" },
      activeOrganizationSlug: "test-org",
    }),
  };
  const controller = new AuthController(
    authService as never,
    { get: () => "true" } as never,
  );
  const res = response();

  const body = await controller.refresh(
    { cookies: { sessionId: "session-1", refreshToken: "refresh-1" } },
    res as never,
  );

  assert.equal(body.accessToken, "session-1-refresh-1-access");
  assert.deepEqual(
    res.cookies.map((cookie) => cookie.name),
    ["refreshToken", "sessionId"],
  );
});

test("logout and me delegate to the authenticated user context", async () => {
  const calls: string[] = [];
  const authService = {
    logout: async (sessionId: string) => calls.push(sessionId),
    me: async (userId: string) => ({ id: userId, email: "user@example.com" }),
  };
  const controller = new AuthController(
    authService as never,
    { get: () => "localhost" } as never,
  );
  const res = response();

  const logout = await controller.logout(
    { sessionId: "session-1" },
    res as never,
  );
  const me = await controller.me({ userId: "user-1" });

  assert.deepEqual(logout, { ok: true });
  assert.deepEqual(calls, ["session-1"]);
  assert.equal(me.user.id, "user-1");
  assert.equal(res.cleared[0]?.options.domain, undefined);
});
