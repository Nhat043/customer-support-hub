import assert from "node:assert/strict";
import test from "node:test";
import { SecurityHeadersMiddleware } from "../../../../src/common/security/security-headers.middleware";

test("security headers protect JSON endpoints and only enable HSTS in production", () => {
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const headers: Record<string, string> = {};
  new SecurityHeadersMiddleware().use(
    { path: "/api/health" } as any,
    { setHeader: (name: string, value: string) => { headers[name] = value; } } as any,
    () => undefined
  );
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.match(headers["Content-Security-Policy"]!, /frame-ancestors 'none'/);
  assert.match(headers["Strict-Transport-Security"]!, /max-age=31536000/);
  process.env.NODE_ENV = previousEnvironment;
});

test("security headers leave Swagger CSP-free so its inline UI still works", () => {
  const headers: Record<string, string> = {};
  new SecurityHeadersMiddleware().use(
    { path: "/api/docs" } as any,
    { setHeader: (name: string, value: string) => { headers[name] = value; } } as any,
    () => undefined
  );
  assert.equal(headers["Content-Security-Policy"], undefined);
});
