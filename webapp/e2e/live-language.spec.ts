import { expect, test, type Page } from "@playwright/test";
import { fakeTripServer, signIn } from "./live-fake";

/**
 * Contract v0.16.1 §9 (owner 2026-10-29, "Fix fully (Recommended)"): in live mode the language pickers save the admin's
 * own language with PATCH /admin/auth/me, the panel switches at once and the choice stays after reload and sign-in.
 */
const SHOTS = process.env.LANG_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const nav = (page: Page) => page.locator("nav");

test("Svenska from the dashboard switch: Swedish at once, after reload and after a new sign-in", async ({ page }) => {
  const state = await fakeTripServer(page);
  await signIn(page);
  await page.getByTestId("language-quick-switch").getByRole("button", { name: /Svenska/ }).click();
  await page.waitForTimeout(500);
  await shot(page, "live-quick-switch-sv");
  await expect(nav(page).getByRole("link", { name: "Kontrollpanel", exact: true })).toBeVisible();
  const patch = state.calls.find((call) => call.method === "PATCH" && call.path === "/api/v1/admin/auth/me");
  expect(patch?.body).toEqual({ language: "sv" });
  expect(patch?.headers["idempotency-key"]).toBeTruthy();

  await page.reload();
  await expect(nav(page).getByRole("link", { name: "Kontrollpanel", exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, "live-quick-switch-sv-after-reload");

  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto("/");
  await page.getByLabel(/E-post|Email/).fill("owner@movera.se");
  await page.getByLabel(/Lösenord|Password/).fill("correct-horse");
  await page.getByRole("button", { name: /Logga in|Sign in/ }).click();
  await expect(nav(page).getByRole("link", { name: "Kontrollpanel", exact: true })).toBeVisible();
});

test("Français from My profile: French at once and after reload", async ({ page }) => {
  const state = await fakeTripServer(page);
  await signIn(page);
  await page.getByTestId("profile-button").click();
  const profile = page.getByRole("dialog", { name: "My profile" });
  await profile.getByLabel("Panel language").selectOption("fr");
  await profile.getByRole("button", { name: "Save language" }).click();
  await page.waitForTimeout(500);
  await shot(page, "live-profile-fr");
  await expect(nav(page).getByRole("link", { name: "Tableau de bord", exact: true })).toBeVisible();
  expect(state.calls.find((call) => call.method === "PATCH" && call.path === "/api/v1/admin/auth/me")?.body).toEqual({ language: "fr" });

  await page.reload();
  await expect(nav(page).getByRole("link", { name: "Tableau de bord", exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, "live-profile-fr-after-reload");
});
