import { expect, type Page } from "@playwright/test";

export function e2eSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function waitForWorkspaceSession(page: Page, expectedRole: "OWNER" | "ADMIN" | "MEMBER") {
  await expect
    .poll(
      () => page.evaluate(() => window.sessionStorage.getItem("customer-support-hub.session")),
      { message: "workspace session should be persisted before navigating", timeout: 15_000 }
    )
    .toContain(`"activeMembershipRole":"${expectedRole}"`);
}

export async function registerOwner(page: Page, suffix = e2eSuffix()) {
  await page.goto("/register");
  await expect(page).toHaveURL(/\/register$/);
  await page.getByLabel("Full name").fill("E2E Owner");
  await page.getByLabel("Work email").fill(`owner-${suffix}@example.test`);
  await page.getByLabel("Create a password").fill("E2EOwnerPassword123!");
  await page.getByLabel("Company name").fill(`E2E Support ${suffix}`);
  await page.getByRole("button", { name: "Create company workspace" }).click();
  await expect(page).toHaveURL(/\/orgs\/[^/]+\/dashboard$/);
  await waitForWorkspaceSession(page, "OWNER");

  const organizationSlug = new URL(page.url()).pathname.split("/")[2];
  expect(organizationSlug).toBeTruthy();
  return { organizationSlug: organizationSlug!, suffix };
}

export async function createRequest(
  page: Page,
  organizationSlug: string,
  title: string,
  description: string,
  expectedRole: "OWNER" | "ADMIN" | "MEMBER" = "OWNER"
) {
  await page.goto(`/orgs/${organizationSlug}/workflow-items`);
  await expect(page.getByRole("heading", { name: "Support queue" })).toBeVisible();
  await waitForWorkspaceSession(page, expectedRole);

  const titleInput = page.getByPlaceholder("Short summary, e.g. Customer has not received an order");
  await expect(titleInput).toBeVisible();
  await titleInput.fill(title);
  await page.getByPlaceholder("Add the customer details, issue, and information your team needs").fill(description);
  await page.getByRole("button", { name: "Add to support queue" }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}
