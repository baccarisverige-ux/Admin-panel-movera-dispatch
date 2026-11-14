import { expect, test, type Page } from "@playwright/test";

/**
 * BQ-A26 + FU-A29-2: the live branches (server fare / moveraKeepsNow on the raise box, server Payout.summary on the
 * line-by-line card) are covered by src/payments/a26LiveMoney.test.ts. This spec checks that the demo keeps its own
 * numbers, in English and Swedish. A26_SHOTS=<dir> also saves the after screenshots.
 */
test.use({ deviceScaleFactor: 2 });

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("nora@movera.se");
  await page.getByLabel("Password").fill("movera");
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function pickLanguage(page: Page, code: "en" | "sv") {
  await page.getByTestId("profile-button").click();
  const menu = page.locator("#profile-menu");
  await expect(menu).toBeVisible();
  await menu.locator("select").selectOption(code);
  await menu.getByRole("button", { name: /Save language|Spara språk/ }).click();
  await expect(menu).toBeHidden();
}

async function shot(page: Page, name: string, selector: string) {
  const dir = process.env.A26_SHOTS;
  if (!dir) return;
  await page.locator(selector).first().screenshot({ path: `${dir}/${name}.png` });
}

for (const lang of ["en", "sv"] as const) {
  test(`A26 demo (${lang}): the raise box and the payout lines keep the demo numbers`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-05T16:00:00Z"));
    await page.setViewportSize({ width: 1440, height: 1600 });
    await signIn(page);
    await expect(page.getByTestId("profile-button")).toBeVisible();
    if (lang === "sv") await pickLanguage(page, "sv");
    await page.goto("/reservations/B021");
    const raise = page.getByTestId("reservation-raise");
    await expect(raise).toBeVisible();
    await expect(raise).toContainText(lang === "sv" ? "provision" : "Movera's commission");
    // Demo only: the live rule line is not drawn.
    await expect(page.getByTestId("reservation-raise-rule")).toHaveCount(0);
    await raise.locator("input").fill("120");
    await shot(page, `A26-reservation-raise-demo-${lang}`, "[data-testid=reservation-raise]");
    await page.goto("/payouts");
    const lines = page.locator("section.po-lines");
    await expect(lines).toBeVisible();
    await expect(lines).toContainText(/20\s?%/);
    await expect(page.getByTestId("payout-lines-not-connected")).toHaveCount(0);
    await shot(page, `A26-payout-lines-demo-${lang}`, "section.po-lines");
  });
}
