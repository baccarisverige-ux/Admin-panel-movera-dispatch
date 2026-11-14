import { expect, test, type Page } from "@playwright/test";
import { fakeTripServer, signIn } from "./live-fake";

/**
 * BQ-A27: the Swedish language file fails to load (seen in e2e as net::ERR_INSUFFICIENT_RESOURCES). Before, the panel
 * stayed on "…" for good. Now it tries again a few times; when every try fails it shows English with a note in the
 * language switch, and "Try again" loads Swedish once the file can be fetched.
 */
const SV_FILE = /\/assets\/sv-[A-Za-z0-9_-]+\.js(\?.*)?$/;
const nav = (page: Page) => page.locator("nav");
const SHOTS = process.env.LANG_SHOTS;

test("Swedish file never loads: English with a note, then Try again brings Swedish", async ({ page }) => {
  await fakeTripServer(page);
  let blocked = 0;
  await page.route(SV_FILE, (route) => { blocked += 1; return route.abort("failed"); });
  await signIn(page);
  await page.getByTestId("language-quick-switch").getByRole("button", { name: /Svenska/ }).click();
  const note = page.getByTestId("language-fallback-note");
  await expect(note).toHaveText(/Could not load Svenska, showing English\./, { timeout: 15_000 });
  await expect(nav(page).getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
  expect(blocked).toBeGreaterThanOrEqual(4);
  if (SHOTS) await page.getByTestId("language-quick-switch").screenshot({ path: `${SHOTS}/a27-fallback-note.png` });

  await page.unroute(SV_FILE);
  await note.getByRole("button", { name: "Try again" }).click();
  await expect(nav(page).getByRole("link", { name: "Kontrollpanel", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("language-fallback-note")).toHaveCount(0);
});

test("Swedish file fails once: the next try loads it and no note is shown", async ({ page }) => {
  await fakeTripServer(page);
  let blocked = 0;
  await page.route(SV_FILE, (route) => {
    if (blocked === 0) { blocked += 1; return route.abort("failed"); }
    return route.continue();
  });
  await signIn(page);
  await page.getByTestId("language-quick-switch").getByRole("button", { name: /Svenska/ }).click();
  await expect(nav(page).getByRole("link", { name: "Kontrollpanel", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("language-fallback-note")).toHaveCount(0);
  expect(blocked).toBe(1);
});
