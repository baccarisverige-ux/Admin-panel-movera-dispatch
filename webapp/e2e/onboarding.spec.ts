import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("nora@movera.se");
  await page.getByLabel("Password").fill("movera");
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Onboarding" })).toBeVisible();
}

async function confirm(page: Page) {
  await page.locator(".modal.open").getByRole("button", { name: "Confirm" }).click();
}

test("onboarding approves documents and activates a driver", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page);
  await page.getByRole("link", { name: "Onboarding" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Onboarding queue" })).toBeVisible();
  await expect(page.getByText("driver license").first()).toBeVisible();
  await expect(page.getByText("company registration").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve remaining" }).click();
  await confirm(page);
  await expect(page.getByText("Documents approved.")).toBeVisible();
  await page.getByRole("button", { name: "Activate" }).click();
  await confirm(page);
  await expect(page.getByText("Driver is active. New offers can be sent.")).toBeVisible();
  await page.getByRole("link", { name: "Drivers", exact: true }).click();
  await page.getByRole("button", { name: "Pending", exact: true }).click();
  await page.getByRole("cell", { name: "MV-SE-0001" }).click();
  await expect(page).toHaveURL(/\/drivers\/D0001$/);
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
  await page.getByRole("tab", { name: "Documents" }).click();
  await expect(page).toHaveURL(/tab=documents/);
  const documents = page.locator('#tabpanel-documents');
  await expect(documents).toHaveClass(/active/);
  await expect(documents).not.toHaveAttribute('hidden', '');
  await expect(page.getByTestId("doc-driver_license")).toContainText("Needed");
  await page.getByRole("tab", { name: "Vehicles" }).click();
  await expect(page.locator("#tabpanel-vehicles").getByText(/No vehicle linked|ABC 123|MVR/).first()).toBeVisible();
});
