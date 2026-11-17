import { expect, test, type Page } from "@playwright/test";

/**
 * PR #345 (the small blue "i" by every admin setting): the "i" never takes a field's name, and the Tips & limits tab
 * has no side scroll at 1280 px in every admin language.
 */
async function session(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("movera-admin-session", "nora");
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  });
}

async function pickLanguage(page: Page, code: "en" | "fr" | "sv") {
  await page.goto("/");
  await expect(page.locator(".topbar h1")).toBeVisible();
  await page.getByTestId("profile-button").click();
  const menu = page.locator("#profile-menu");
  await menu.locator("select").selectOption(code);
  const save = menu.getByRole("button", { name: /Save language|Enregistrer la langue|Spara språket/ });
  if (await save.isEnabled()) await save.click();
  else await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("lang", code);
}

test("the i keeps the field's own name: getByLabel and the exact role name find only the field", async ({ page }) => {
  await session(page);
  await page.goto("/settings");
  await expect(page.getByRole("checkbox", { name: "Wallet", exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Wallet", { exact: true })).toHaveCount(1);
  const info = page.locator(".setting-info-btn").first();
  await expect(info).toHaveAttribute("aria-label", "Info");
  await info.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".setting-info-card")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".setting-info-card")).toHaveCount(0);
  // No accessible name anywhere contains a setting label next to the word Info.
  expect(await page.locator('[aria-label^="Info:"]').count()).toBe(0);
});

for (const lang of ["en", "sv", "fr"] as const) {
  test(`${lang} /pricing?tab=extras has no side scroll at 1280 px`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await session(page);
    await pickLanguage(page, lang);
    await page.goto("/pricing?tab=extras");
    await expect(page.getByTestId("pricing-extras")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${lang}: no horizontal scroll at 1280 px`).toBeLessThanOrEqual(1);
  });
}
