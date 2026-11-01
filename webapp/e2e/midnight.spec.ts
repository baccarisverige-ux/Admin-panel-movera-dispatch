import { expect, test, type Page } from "@playwright/test";

// The minutes around midnight in Stockholm (Sunday 1 Nov 2026 → Monday 2 Nov), in the browser time zone CI uses (UTC)
// and the admins' own. Two demo tests failed in CI here.
const BEFORE = "2026-11-01T22:59:00Z"; // 23:59 Sunday in Stockholm
const AFTER = "2026-11-01T23:01:00Z"; // 00:01 Monday in Stockholm

async function signIn(page: Page, at: string) {
  await page.clock.install({ time: new Date(at) });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("mn-test-session")) {
      localStorage.setItem("movera-admin-session", "nora");
      sessionStorage.setItem("mn-test-session", "1");
    }
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  });
}

for (const timezoneId of ["UTC", "Europe/Stockholm"]) {
  test.describe(`browser in ${timezoneId}`, () => {
    test.use({ timezoneId });

    for (const at of [BEFORE, AFTER]) {
      test(`work done at ${at} shows in Admin work for Today`, async ({ page }) => {
        // At 23:59 "now" was rounded up to 00:00 and Today became the next, empty, day.
        await signIn(page, at);
        await page.goto("/reports?tab=money");
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name: "CSV", exact: true }).click();
        await download;
        await page.getByRole("tab", { name: "Admin work" }).click();
        const admins = page.getByRole("table", { name: "Admin work" });
        await expect(admins).toContainText("Nora Lind");
        await expect(admins).not.toContainText("Nothing in this period");
      });
    }

    test("just after midnight Today is a new day and Month still holds yesterday", async ({ page }) => {
      await signIn(page, AFTER);
      await page.goto("/?country=SE");
      const gross = page.getByTestId("gross-bookings");
      await expect(gross).toContainText("kr");
      const today = await gross.innerText();
      await page.getByRole("radio", { name: "Month" }).click();
      await expect(page).toHaveURL(/period=month/);
      await expect(gross).not.toHaveText(today);
    });

    test("just before midnight Today is still Sunday, and the week holds more", async ({ page }) => {
      await signIn(page, BEFORE);
      await page.goto("/?country=SE");
      const gross = page.getByTestId("gross-bookings");
      await expect(gross).toContainText("kr");
      const today = await gross.innerText();
      await page.getByRole("radio", { name: "Week" }).click();
      await expect(page).toHaveURL(/period=week/);
      await expect(gross).not.toHaveText(today);
    });
  });
}
