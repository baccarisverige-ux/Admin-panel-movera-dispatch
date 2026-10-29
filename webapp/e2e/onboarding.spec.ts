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

/**
 * Owner decisions of 2026-10-29: item 1 (a document that expires is approved with its expiry date typed) and 18
 * ("Remove the button": no Approve all). Every remaining document is approved one by one; the info session is marked held.
 */
async function approveOneByOne(page: Page) {
  const app = page.getByRole("article", { name: /^Application of / });
  await expect(app.getByRole("button", { name: /^Approve (remaining|all)/ })).toHaveCount(0);
  const date = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
  for (let round = 0; round < 30; round += 1) {
    const fields = app.getByLabel(/^Valid until for /);
    for (let index = 0; index < (await fields.count()); index += 1) {
      const field = fields.nth(index);
      if ((await field.inputValue()) === "") {
        const label = (await field.getAttribute("aria-label"))!.replace("Valid until for ", "");
        await expect(app.getByRole("button", { name: `Approve ${label}`, exact: true })).toBeDisabled();
        await field.fill(date);
      }
    }
    const button = app.getByRole("button", { name: /^(Approve|Mark held) / }).and(page.locator(":enabled")).first();
    if (!(await button.count())) return;
    await button.click();
    await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
    await expect(page.locator(".modal.open")).toHaveCount(0);
  }
  throw new Error("documents left to approve");
}

test("onboarding approves documents and activates a driver", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page);
  await page.getByRole("link", { name: "Onboarding" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Onboarding queue" })).toBeVisible();
  await expect(page.getByText("driver license").first()).toBeVisible();
  await expect(page.getByText("company registration").first()).toBeVisible();
  await approveOneByOne(page);
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
