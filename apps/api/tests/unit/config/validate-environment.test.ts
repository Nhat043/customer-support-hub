import assert from "node:assert/strict";
import { test } from "node:test";
import { validateEnvironment } from "../../../src/config/validate-environment";

test("production configuration accepts HTTPS cookies and strong secrets", () => {
  assert.doesNotThrow(() =>
    validateEnvironment({
      NODE_ENV: "production",
      COOKIE_SECURE: "true",
      WEB_BASE_URL: "https://app.example.com",
      JWT_ACCESS_SECRET: "a".repeat(32),
      REFRESH_TOKEN_PEPPER: "b".repeat(32),
      ACCESS_TOKEN_TTL: "15m",
      REFRESH_TOKEN_TTL: "30d",
      REFRESH_TOKEN_ABSOLUTE_TTL: "90d",
    }),
  );
});

test("production configuration rejects insecure cookies and placeholder secrets", () => {
  assert.throws(
    () =>
      validateEnvironment({
        NODE_ENV: "production",
        COOKIE_SECURE: "false",
        WEB_BASE_URL: "http://app.example.com",
        JWT_ACCESS_SECRET: "replace-me-access-secret",
        REFRESH_TOKEN_PEPPER: "short",
      }),
    /COOKIE_SECURE.*WEB_BASE_URL.*JWT_ACCESS_SECRET.*REFRESH_TOKEN_PEPPER/,
  );
});

test("configuration rejects invalid token duration syntax", () => {
  assert.throws(
    () => validateEnvironment({ REFRESH_TOKEN_TTL: "30days" }),
    /REFRESH_TOKEN_TTL/,
  );
});
