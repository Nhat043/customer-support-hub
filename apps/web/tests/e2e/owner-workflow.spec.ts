import { expect, test } from "@playwright/test";
import { createRequest, e2eSuffix, registerOwner } from "./helpers";

test("owner can create a workspace, add a request, and query it through the copilot", async ({ page }) => {
  const { organizationSlug } = await registerOwner(page);
  const title = `Delivery is delayed ${e2eSuffix()}`;
  await createRequest(page, organizationSlug, title, "Order #E2E-42 has not arrived.");

  await page.getByRole("button", { name: "Open AI support assistant" }).click();
  const composer = page.getByPlaceholder("Ask about requests, queue status, or where to go...");
  await composer.fill("Are there any new requests?");
  await composer.press("Enter");
  await expect(page.getByText(/I found .* matching customer request/)).toBeVisible();
});
