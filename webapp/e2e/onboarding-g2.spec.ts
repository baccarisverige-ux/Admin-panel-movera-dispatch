import { expect, test, type Page } from "@playwright/test";

/**
 * Driver group 2 "Onboarding" (owner decisions of 2026-10-29, items 1, 8, 10-15), demo build: the same settings page as
 * live (one onboarding document per country), new document types, expiry dates when approving, Mark held, SE and FR.
 */
async function session(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("g2-session")) {
      localStorage.setItem("movera-admin-session", "nora");
      sessionStorage.setItem("g2-session", "1");
    }
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  });
}
const modal = (page: Page) => page.locator(".modal.open").last();
async function confirm(page: Page) {
  const reason = modal(page).getByLabel(/^Reason$/);
  if ((await reason.count()) && (await reason.evaluate((el) => el.tagName)) === "SELECT" && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal(page).getByRole("button", { name: "Confirm" }).click();
}
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

for (const [country, name, extra] of [["SE", "Sweden", "Taxi driver licence"], ["FR", "France", "VTC professional card"]] as const) {
  test(`items 14/15 (${country}): add a new document type, rename one, remove one, publish`, async ({ page }) => {
    await session(page);
    await page.goto(`/onboarding?view=steps&country=${country}`);
    await expect(page.getByRole("heading", { name: `Onboarding steps for ${name}` })).toBeVisible();
    const drivers = page.getByRole("list", { name: "Driver documents" });
    const before = country === "SE" ? 5 : 6;
    await expect(drivers.locator("li[data-type]")).toHaveCount(before);
    await expect(drivers.locator('[data-type="driving_license"]')).toContainText("Expires");
    await expect(drivers.locator('[data-type="info_session"]')).toContainText("Checked by Movera");
    await page.getByRole("region", { name: "Driver documents" }).getByRole("button", { name: "New document type" }).click();
    const dialog = page.getByTestId("type-dialog");
    for (const [lang, word] of [["Swedish", "Läkarintyg"], ["French", "Certificat médical"], ["English", "Medical certificate"]]) {
      await dialog.getByLabel(`Name (${lang})`).fill(word);
      await dialog.getByLabel(`Help text (${lang})`).fill(`${word}: stamp visible`);
    }
    await dialog.getByRole("checkbox", { name: /Expires: the admin types/ }).check();
    await dialog.getByRole("button", { name: "Add the document" }).click();
    await expect(drivers.locator("li[data-type]")).toHaveCount(before + 1);
    await expect(drivers).toContainText("Medical certificate");
    await drivers.getByRole("button", { name: `Remove ${extra}` }).click();
    await drivers.getByRole("button", { name: "Edit Profile photo" }).click();
    await page.getByTestId("type-dialog").getByLabel("Name (English)").fill("Face photo");
    await page.getByTestId("type-dialog").getByRole("button", { name: "Save" }).click();
    await expect(drivers.getByRole("button", { name: "Remove Driving licence" })).toBeDisabled();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await confirm(page);
    await expect(page.getByText("Everything is published")).toBeVisible();
    await page.reload();
    const after = page.getByRole("list", { name: "Driver documents" });
    await expect(after).toContainText("Medical certificate");
    await expect(after).toContainText("Face photo");
    await expect(after).not.toContainText(extra);
    await expect(after.locator('li[data-type^="custom_"]')).toHaveCount(1);
    await expect(page.getByTestId("settings-status")).toContainText("Live version 1.");
  });
}

test("item 12: Tunisia is shown but closed", async ({ page }) => {
  await session(page);
  await page.goto("/onboarding?view=steps&country=TN");
  await expect(page.getByTestId("country-closed")).toBeVisible();
  await expect(page.getByRole("list", { name: "Driver documents" })).toContainText("No documents in this list.");
});

test("item 11 (FR): car rules per category are published with the onboarding settings", async ({ page }) => {
  await session(page);
  await page.goto("/vehicles?view=rules&country=FR");
  await expect(page.getByRole("heading", { name: "Vehicle rules for France" })).toBeVisible();
  await expect(page.getByLabel("Movera oldest year")).toHaveValue("2016");
  await page.getByLabel("Movera oldest year").fill("2018");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(page);
  await expect(page.getByText("Everything is published")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Movera oldest year")).toHaveValue("2018");
});

test("items 1 and 8 (SE): approving a document that expires needs its date; the info session is marked held", async ({ page }) => {
  await session(page);
  await page.goto("/onboarding");
  await page.getByRole("cell", { name: "D0005" }).click();
  const app = page.getByRole("article", { name: /^Application of / });
  const approve = app.getByRole("button", { name: "Approve Driving licence" });
  if (await approve.isEnabled()) throw new Error("approve must wait for the date");
  await app.getByLabel("Valid until for Driving licence").fill(day(400));
  await expect(approve).toBeEnabled();
  await approve.click();
  await confirm(page);
  await expect(app.getByLabel("Valid until for Driving licence")).toHaveCount(0);
  const held = app.getByRole("button", { name: "Mark held Training session" });
  if (await held.count()) {
    await held.click();
    await confirm(page);
  }
  await expect(app.getByRole("button", { name: "Approve remaining" })).toBeVisible();
});

test("fits a phone", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 860 });
  for (const path of ["/onboarding?view=steps", "/vehicles?view=rules&country=FR"]) {
    await page.goto(path);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(392);
  }
});
