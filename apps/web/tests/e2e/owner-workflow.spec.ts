import { expect, test } from "@playwright/test";

test("owner can create a workspace, add a request, and query it through the copilot", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // This scenario verifies registration rather than client-side landing-page navigation.
  await page.goto("/register");
  await expect(page).toHaveURL(/\/register$/);
  await page.getByLabel("Full name").fill("E2E Owner");
  await page.getByLabel("Work email").fill(`owner-${unique}@example.test`);
  await page.getByLabel("Create a password").fill("E2EOwnerPassword123!");
  await page.getByLabel("Company name").fill(`E2E Support ${unique}`);
  await page.getByRole("button", { name: "Create company workspace" }).click();

  await expect(page).toHaveURL(/\/orgs\/[^/]+\/dashboard$/);
  await page.getByRole("link", { name: "Customer requests" }).click();
  await expect(page.getByRole("heading", { name: "Support queue" })).toBeVisible();
  await page.getByPlaceholder("Short summary, e.g. Customer has not received an order").fill("Delivery is delayed");
  await page.getByPlaceholder("Add the customer details, issue, and information your team needs").fill("Order #E2E-42 has not arrived.");
  await page.getByRole("button", { name: "Add to support queue" }).click();
  await expect(page.getByText("Delivery is delayed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open AI support assistant" }).click();
  const composer = page.getByPlaceholder("Ask about requests, queue status, or where to go...");
  await composer.fill("Are there any new requests?");
  await composer.press("Enter");
  await expect(page.getByText("I found 1 matching customer request.")).toBeVisible();
});
