import assert from "node:assert/strict";
import test from "node:test";
import process from "node:process";

const enabled = process.env.RUN_E2E_SMOKE_TESTS === "true";
const webBaseUrl = process.env.WEB_BASE_URL ?? "http://localhost:3000";

test("landing page is reachable and describes the customer-support domain", { skip: !enabled }, async () => {
  const response = await globalThis.fetch(webBaseUrl);
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.match(page, /Customer Support Hub/);
  assert.match(page, /customer request/i);
});
