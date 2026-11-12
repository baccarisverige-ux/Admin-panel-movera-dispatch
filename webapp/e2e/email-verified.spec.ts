import { expect, test, type Page } from "@playwright/test";

/**
 * G30 (contract v0.18.76, contract.json#emailVerified.approvalSetting; owner 2026-11-12 Q6 "Add the setting, off"):
 * Drivers › Onboarding › Steps and papers has the per-country switch "Driver needs a verified e-mail before approval",
 * OFF by default, with the always-visible warning while Movera has no own e-mail domain (REMINDERS 58); turning it on
 * asks first with the same warning; it is published like the other onboarding settings.
 */
async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    if (!sessionStorage.getItem("dx-test-session")) {
      localStorage.setItem("movera-admin-session", id);
      sessionStorage.setItem("dx-test-session", "1");
    }
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

const WARNING = "Until Movera's own e-mail domain is added in the e-mail service, codes reach only the test address. Turning this on now stops new drivers from being approved.";

test("G30: the e-mail approval switch is off by default, warns, asks before turning on, and publishes", async ({ page }) => {
  await session(page);
  await page.goto("/onboarding?view=steps");
  const card = page.getByRole("region", { name: "E-mail before approval" });
  const toggle = card.getByLabel("Driver needs a verified e-mail before approval on");
  await expect(toggle).not.toBeChecked();
  await expect(card.getByTestId("email-check-warning")).toHaveText(WARNING);

  await toggle.click();
  const dialog = page.getByTestId("email-check-confirm");
  await expect(dialog).toContainText(WARNING);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(toggle).not.toBeChecked();

  await toggle.click();
  await page.getByTestId("email-check-confirm").getByRole("button", { name: "Turn on" }).click();
  await expect(toggle).toBeChecked();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Everything is published")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "E-mail before approval" }).getByLabel("Driver needs a verified e-mail before approval on")).toBeChecked();

  // Turning it off needs no question.
  await page.getByRole("region", { name: "E-mail before approval" }).getByLabel("Driver needs a verified e-mail before approval on").click();
  await expect(page.getByTestId("email-check-confirm")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "E-mail before approval" }).getByLabel("Driver needs a verified e-mail before approval on")).not.toBeChecked();
});
