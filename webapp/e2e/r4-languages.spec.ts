import { expect, test, type Page } from "@playwright/test";
import { fr } from "../src/i18n/fr";
import { sv } from "../src/i18n/sv";

/**
 * Round 4 languages (owner Q48/Q49): English, French and Swedish. Each admin picks a language in their profile
 * (the avatar in the top bar); the choice is saved for that admin, logged in My activity and wins over the country
 * default. The suite's build starts everyone in English (VITE_ADMIN_LANGUAGE=en), so these tests pick fr and sv.
 */

const SHOTS = process.env.R4_SHOTS ?? "";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

/** Opens the profile and saves a language; the panel is drawn again in it. */
async function pickLanguage(page: Page, code: "" | "en" | "fr" | "sv", saveLabel = "Save language") {
  await page.getByTestId("profile-button").click();
  const menu = page.locator("#profile-menu");
  await expect(menu).toBeVisible();
  await menu.locator("select").selectOption(code);
  await menu.getByRole("button", { name: saveLabel }).click();
  await expect(menu).toBeHidden();
}

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${where}: no horizontal scroll`).toBeLessThanOrEqual(1);
}

type Check = { path: string; title: string; text: string; name: string };

/** Each main page, its menu title and one text of the page, in English; the test reads the translation. */
const PAGES: Check[] = [
  { path: "/", title: "Dashboard", text: "Today", name: "dashboard" },
  { path: "/trips", title: "Trips", text: "All trips", name: "trips" },
  { path: "/trips/T0004", title: "Trips", text: "Who did what", name: "trip" },
  { path: "/dispatch", title: "Dispatch", text: "How ride requests find a driver, with rules for every zone. Radar, Exclusive and reservations have their own section.", name: "dispatch" },
  { path: "/dispatch?view=features", title: "Dispatch", text: "Every setting and feature, in one list. Click one to open its section.", name: "dispatch-features" },
  { path: "/dispatch?view=activity", title: "Dispatch", text: "Change my panel language", name: "dispatch-activity" },
  { path: "/pricing", title: "Pricing", text: "Editing zone", name: "pricing" },
  { path: "/pricing?tab=extras", title: "Pricing", text: "Raise-offer quick steps", name: "pricing-tips" },
  { path: "/settings", title: "Settings", text: "Payment methods and languages per country", name: "settings" },
  { path: "/payments", title: "Payments", text: "Failed and retries", name: "payments" },
  { path: "/riders", title: "Riders", text: "All riders", name: "riders" },
  { path: "/drivers", title: "Drivers", text: "All drivers", name: "drivers" },
  { path: "/zones", title: "Zones", text: "New zone", name: "zones" },
  { path: "/alerts", title: "Alerts", text: "History & numbers", name: "alerts" },
];

const DICTIONARY = { fr, sv } as const;
const say = (lang: "fr" | "sv", english: string) => (DICTIONARY[lang] as Record<string, string>)[english] ?? english;

async function visitAll(page: Page, lang: "fr" | "sv") {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    for (const check of PAGES) {
      await page.goto(check.path);
      await expect(page.locator(".topbar h1"), check.path).toHaveText(say(lang, check.title));
      const text = say(lang, check.text);
      expect(text, `${check.text} is translated to ${lang}`).not.toBe(check.text);
      await expect(page.locator("main").getByText(text, { exact: false }).first(), `${lang} ${check.path}`).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await noSideScroll(page, `${lang} ${check.path} at ${width}px`);
      await shot(page, `${lang}-${check.name}-${width}`);
    }
  }
}

test("the profile picker shows codes; French is saved for this admin, logged in My activity and used on every main page", async ({ page }) => {
  test.setTimeout(180_000);
  await session(page);
  await page.goto("/");
  await expect(page.locator(".topbar h1")).toHaveText("Dashboard");
  await page.getByTestId("profile-button").click();
  const menu = page.locator("#profile-menu");
  await expect(menu.getByRole("heading", { name: "My profile" })).toBeVisible();
  const options = await menu.locator("select option").allTextContents();
  expect(options).toEqual(["Country default (EN · English)", "EN · English", "FR · Français", "SV · Svenska"]);
  await expect(menu.getByRole("button", { name: "Save language" })).toBeDisabled();
  await shot(page, "profile-en-1280");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await pickLanguage(page, "fr");
  await expect(page.locator(".topbar h1")).toHaveText("Tableau de bord");
  await expect(page.locator("#main-menu")).toContainText("Répartition");
  await expect(page.locator("#main-menu")).toContainText("Lieux et tarifs");
  await page.getByTestId("profile-button").click();
  await expect(page.locator("#profile-menu select")).toHaveValue("fr");
  await expect(page.locator("#profile-menu")).toContainText("Mon profil");
  await shot(page, "profile-fr-1280");
  await page.keyboard.press("Escape");

  // Saved for this admin: a new page load keeps it.
  await page.reload();
  await expect(page.locator(".topbar h1")).toHaveText("Tableau de bord");

  // My activity lists the change with its before and after.
  await page.goto("/dispatch?view=activity");
  const entry = page.locator("main").getByText("Changer ma langue du panneau").first();
  await expect(entry).toBeVisible();
  await entry.click();
  // Before and after are audit data: kept as they were written, not translated.
  await expect(page.locator("main")).toContainText("en (country default)");
  await expect(page.locator("main")).toContainText("fr");

  await visitAll(page, "fr");
});

test("Swedish on every main page, dates in Swedish, then back to the country default", async ({ page }) => {
  test.setTimeout(180_000);
  await session(page);
  await page.goto("/");
  await pickLanguage(page, "sv");
  await expect(page.locator(".topbar h1")).toHaveText("Kontrollpanel");
  await expect(page.locator(".profile-meta")).toContainText(/\d{1,2} [a-zåäö]{3}\.? \d{4}/);
  await visitAll(page, "sv");

  // Back to the default ("Country default", value ""): the build default (English in this suite) applies again.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await pickLanguage(page, "", "Spara språket");
  await expect(page.locator(".topbar h1")).toHaveText("Dashboard");
});

test("dialog texts follow the language: confirm, reason and Please wait", async ({ page }) => {
  await session(page);
  await page.goto("/");
  await pickLanguage(page, "fr");
  await page.goto("/trips/T0004");
  const cancel = page.getByRole("button", { name: "Annuler la course" }).first();
  await expect(cancel).toBeVisible();
  await cancel.click();
  const dialog = page.locator(".modal.open").last();
  await expect(dialog.getByRole("button", { name: "Confirmer" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Annuler", exact: true })).toBeVisible();
  await expect(dialog.locator("select").first().locator("option").first()).toHaveText("Choisir un motif");
  await shot(page, "fr-dialog-1280");
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(dialog).toBeHidden();
});
