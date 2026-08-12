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
      CSRF_SECRET: "c".repeat(32),
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
    /COOKIE_SECURE.*WEB_BASE_URL.*JWT_ACCESS_SECRET.*REFRESH_TOKEN_PEPPER.*CSRF_SECRET/,
  );
});

test("configuration rejects invalid token duration syntax", () => {
  assert.throws(
    () => validateEnvironment({ REFRESH_TOKEN_TTL: "30days" }),
    /REFRESH_TOKEN_TTL/,
  );
});

test("configuration requires a complete Gmail SMTP setup when email is enabled", () => {
  assert.throws(
    () => validateEnvironment({ EMAIL_PROVIDER: "gmail", SMTP_HOST: "smtp.gmail.com" }),
    /EMAIL_FROM.*SMTP_PORT.*SMTP_SECURE.*SMTP_USER.*SMTP_PASSWORD/,
  );
});

test("configuration accepts Gmail SMTP with an App Password", () => {
  assert.doesNotThrow(() =>
    validateEnvironment({
      EMAIL_PROVIDER: "gmail",
      EMAIL_FROM: "Customer Support Hub <nhatnl04@gmail.com>",
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "nhatnl04@gmail.com",
      SMTP_PASSWORD: "sixteen-character-app-password",
    }),
  );
});

test("Gemini API key mode does not require a Vertex AI project", () => {
  assert.doesNotThrow(() =>
    validateEnvironment({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-api-key",
      GEMINI_USE_VERTEX_AI: "false",
    }),
  );
  assert.throws(
    () =>
      validateEnvironment({
        AI_PROVIDER: "gemini",
        GEMINI_API_KEY: "test-api-key",
        GEMINI_USE_VERTEX_AI: "true",
      }),
    /GOOGLE_CLOUD_PROJECT/,
  );
});

test("semantic Gemini memory requires an API key and valid dimensions", () => {
  assert.throws(
    () => validateEnvironment({ EMBEDDING_PROVIDER: "gemini" }),
    /GEMINI_API_KEY is required when EMBEDDING_PROVIDER=gemini/,
  );
  assert.throws(
    () => validateEnvironment({ EMBEDDING_DIMENSIONS: "768.5" }),
    /EMBEDDING_DIMENSIONS/,
  );
  assert.doesNotThrow(() =>
    validateEnvironment({
      EMBEDDING_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-api-key",
      EMBEDDING_DIMENSIONS: "768",
    }),
  );
});
