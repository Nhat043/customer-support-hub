import { expect, test } from "@playwright/test";
import { createRequest, e2eSuffix, registerOwner } from "./helpers";

test("invited member joins with the locked email and manages an attachment", async ({ browser, page }) => {
  const { organizationSlug, suffix } = await registerOwner(page);
  const memberEmail = `member-${suffix}@example.test`;

  await page.goto(`/orgs/${organizationSlug}/team`);
  await expect(page.getByRole("heading", { name: "Invite someone to help with customer requests" })).toBeVisible();
  await page.getByPlaceholder("teammate@company.com").fill(memberEmail);
  await page.locator("select.workspace-role-select").first().selectOption("MEMBER");
  await page.getByRole("button", { name: "Send invitation email" }).click();

  const manualLink = page.getByText(/\/join\?token=/);
  await expect(manualLink).toBeVisible();
  const invitationUrl = await manualLink.textContent();
  expect(invitationUrl).toBeTruthy();

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await memberPage.goto(new URL(invitationUrl!).pathname + new URL(invitationUrl!).search);
  await expect(memberPage).toHaveURL(/\/register\?invitation=/);
  const invitedEmail = memberPage.getByLabel("Invitation email");
  await expect(invitedEmail).toHaveValue(memberEmail);
  await expect(invitedEmail).toHaveJSProperty("readOnly", true);
  await memberPage.getByLabel("Full name").fill("E2E Member");
  await memberPage.getByLabel("Create a password").fill("E2EMemberPassword123!");
  await memberPage.getByRole("button", { name: "Create account and join team" }).click();
  await expect(memberPage).toHaveURL(new RegExp(`/orgs/${organizationSlug}/dashboard$`));

  const title = `Member attachment ${e2eSuffix()}`;
  await createRequest(memberPage, organizationSlug, title, "A member-owned request with a text attachment.");
  await memberPage.getByRole("link", { name: title, exact: true }).click();
  await expect(memberPage).toHaveURL(/\/workflow-items\/[^/]+$/);

  await memberPage.locator('input[name="attachment"]').setInputFiles({
    name: "e2e-support-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("E2E attachment content")
  });
  await memberPage.getByRole("button", { name: "Upload attachment" }).click();
  await expect(memberPage.getByText("e2e-support-note.txt", { exact: true })).toBeVisible();

  memberPage.once("dialog", (dialog) => dialog.accept());
  await memberPage.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(memberPage.getByText("e2e-support-note.txt", { exact: true })).toHaveCount(0);
  await memberContext.close();
});
