import assert from "node:assert/strict";
import { test } from "node:test";
import { JwtGuard } from "../../../../src/common/guards/jwt.guard";

function context() {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization: "Bearer token" } })
    })
  } as never;
}

function contextWithAuthorization(authorization?: string) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) })
  } as never;
}

function guardWithSession(session: unknown) {
  return new JwtGuard(
    { getAllAndOverride: () => false } as never,
    { verify: () => ({ userId: "user-1", sessionId: "session-1" }) } as never,
    { getOrThrow: () => "secret" } as never,
    { session: { findUnique: async () => session } } as never
  );
}

function guardWith(reflector: boolean, session: unknown, verify: () => unknown = () => ({ userId: "user-1", sessionId: "session-1" })) {
  return new JwtGuard(
    { getAllAndOverride: () => reflector } as never,
    { verify } as never,
    { getOrThrow: () => "secret" } as never,
    { session: { findUnique: async () => session } } as never
  );
}

test("JWT guard rejects a revoked session even when the JWT is valid", async () => {
  await assert.rejects(
    () => guardWithSession({ status: "REVOKED", expiresAt: new Date(Date.now() + 60_000), user: { status: "ACTIVE" } }).canActivate(context()),
    (error: { getStatus?: () => number }) => error.getStatus?.() === 401
  );
});

test("JWT guard accepts an active, unexpired session", async () => {
  assert.equal(
    await guardWithSession({ status: "ACTIVE", expiresAt: new Date(Date.now() + 60_000), user: { status: "ACTIVE" } }).canActivate(context()),
    true
  );
});

test("JWT guard allows public routes without checking credentials", async () => {
  assert.equal(await guardWith(true, null).canActivate(contextWithAuthorization()), true);
});

test("JWT guard rejects missing and malformed authorization headers", async () => {
  await assert.rejects(() => guardWith(false, null).canActivate(contextWithAuthorization()), /Missing access token/);
  await assert.rejects(() => guardWith(false, null).canActivate(contextWithAuthorization("Basic token")), /Missing access token/);
  await assert.rejects(() => guardWith(false, null).canActivate(contextWithAuthorization("Bearer ")), /Missing access token/);
});

test("JWT guard rejects invalid tokens and inactive session states", async () => {
  await assert.rejects(
    () => guardWith(false, null, () => { throw new Error("bad token"); }).canActivate(context()),
    /Invalid access token/
  );
  await assert.rejects(() => guardWith(false, null).canActivate(context()), /Invalid access token/);
  await assert.rejects(
    () => guardWith(false, { status: "ACTIVE", expiresAt: new Date(Date.now() - 1), user: { status: "ACTIVE" } }).canActivate(context()),
    /Invalid access token/
  );
  await assert.rejects(
    () => guardWith(false, { status: "ACTIVE", expiresAt: new Date(Date.now() + 60_000), user: { status: "DISABLED" } }).canActivate(context()),
    /Invalid access token/
  );
});
