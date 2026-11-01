import { expect, test, type Page } from "@playwright/test";
import { ADMIN, fakeTripServer, signIn } from "./live-fake";

/**
 * Live page audit round 4 (Rules/audits/live-page-audit-r3.md): the live build shows no "demo / démo" wording on the
 * pages the owner saw it on, in en/fr/sv, and two phone layouts fit the screen (Risk › Fraud rules cards, trip page).
 */

/** Every permission these pages need (as in live-realdata.spec.ts). */
const ALL = { admin: { permissions: [...ADMIN.permissions, "support.reply", "settings.read", "settings.publish", "safety.edit", "incidents.read", "audit.read", "finance.edit", "team.read", "team.edit", "growth.read", "growth.edit"] } };

const PAGES = ["/trips", "/payments", "/promotions", "/confirm", "/settings", "/team?tab=security", "/incidents"];

async function pickLanguage(page: Page, name: RegExp) {
  await page.goto("/");
  await page.getByTestId("language-quick-switch").getByRole("button", { name }).click();
}

for (const [code, name] of [["en", /English/], ["fr", /Français/], ["sv", /Svenska/]] as const) {
  test(`live pages show no demo wording (${code})`, async ({ page }) => {
    await fakeTripServer(page, ALL);
    await signIn(page);
    if (code !== "en") await pickLanguage(page, name);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator("main h2").first()).toBeVisible();
      await page.waitForTimeout(300);
      const text = await page.locator("body").innerText();
      expect(text, `${code} ${path}: page opens`).not.toMatch(/Your role cannot open|Votre rôle ne peut pas|Din roll kan inte/);
      const hits = text.split("\n").filter((line) => /d[ée]mo/i.test(line));
      expect(hits, `${code} ${path}: visible demo wording`).toEqual([]);
    }
  });
}

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Risk › Fraud rules cards use the full page width", async ({ page }) => {
    await fakeTripServer(page, ALL);
    await signIn(page);
    await page.goto("/risk?tab=fraud");
    await expect(page.getByTestId("not-connected").first()).toBeVisible();
    const card = page.locator(".dx-page .dx-card").first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box!.width, "fraud rules card width").toBeGreaterThan(340);
  });

  test("trip page header and cards fit the screen", async ({ page }) => {
    await fakeTripServer(page, ALL);
    await signIn(page);
    await page.goto("/trips/T2001");
    await expect(page.locator(".op-trip .dx-head")).toBeVisible();
    const pageBox = await page.locator(".op-trip").boundingBox();
    expect(pageBox!.width, "trip page uses the screen width").toBeGreaterThan(340);
    const widest = await page.evaluate(() => {
      const root = document.querySelector(".op-trip")!;
      let max = 0;
      for (const el of [root, ...root.querySelectorAll(".dx-head, .dx-head > *, .op-jump, .op-jump button, .op-trip-grid, .op-trip-grid > *, section, article")]) {
        const r = el.getBoundingClientRect();
        if (r.width > 0) max = Math.max(max, r.right);
      }
      return max;
    });
    expect(widest, "rightmost edge of trip header/cards").toBeLessThanOrEqual(390);
  });
});
