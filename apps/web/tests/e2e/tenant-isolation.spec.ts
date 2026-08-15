import { expect, test } from "@playwright/test";
import { createRequest, e2eSuffix, registerOwner } from "./helpers";

test("an owner cannot read a different organization's customer request queue", async ({ browser, page }) => {
  const first = await registerOwner(page);
  const privateTitle = `Private request ${e2eSuffix()}`;
  await createRequest(page, first.organizationSlug, privateTitle, "Only the first organization may read this request.");

  const secondContext = await browser.newContext();
  const secondOwner = await secondContext.newPage();
  const second = await registerOwner(secondOwner);
  expect(second.organizationSlug).not.toBe(first.organizationSlug);

  await secondOwner.goto(`/orgs/${first.organizationSlug}/workflow-items`);
  await expect(secondOwner.getByText("You do not have permission to do that.")).toBeVisible();
  await expect(secondOwner.getByText(privateTitle, { exact: true })).toHaveCount(0);
  await secondContext.close();
});
