import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

/** Round 2 admin settings (owner Q5–Q7, Q10, Q17, Q29, Q39–Q46, Q49), wired into the rider and driver app configs. */

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

const dialog = (page: Page) => page.locator(".modal.open");

async function appConfig(page: Page, app: "Rider" | "Driver"): Promise<Record<string, unknown>> {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: `${app} app config` }).click();
  const file = await (await download).path();
  return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
}

test("Q5/Q6/Q10/Q17/Q29: tips, raise steps, promo cap and driver bonus limit per country, from the Dispatch shortcut to the app configs", async ({ page }) => {
  test.setTimeout(90_000);
  await session(page);
  await page.goto("/dispatch");
  await page.getByRole("button", { name: "Tips & raise steps" }).click();
  await expect(page).toHaveURL(/\/pricing\?tab=extras&section=tips/);
  const panel = page.getByTestId("pricing-extras");
  await expect(panel.getByRole("heading", { name: /Tips & limits · all of Sweden/ })).toBeVisible();
  await expect(page.locator("#extras-tips")).toBeInViewport();

  const tips = panel.getByRole("group", { name: "Tips", exact: true });
  await expect(tips.getByLabel("Tip 1", { exact: true })).toHaveValue("10");
  await tips.getByLabel("Tip 1", { exact: true }).fill("16");
  await tips.getByRole("button", { name: "Add an amount" }).click();
  await expect(tips.getByLabel("Tip 4", { exact: true })).toHaveValue("40");
  // The switch is a styled checkbox: click its visible label.
  await tips.getByRole("listitem").nth(1).getByText("Active").click();
  await expect(tips.getByLabel("Tip 2 active")).not.toBeChecked();
  await expect(tips.getByLabel("Tips the rider sees")).toHaveText(/16,00\skr.*30,00\skr.*40,00\skr/);

  const raise = panel.getByRole("group", { name: "Raise-offer quick steps" });
  await raise.getByLabel("Raise step 4", { exact: true }).fill("250");
  await page.locator("#extras-promo-cap").getByText("No cap").click();
  await expect(panel.getByLabel("Cap promo discounts")).toBeChecked();
  await panel.getByLabel("Promo cap", { exact: true }).fill("80");

  // Q17: never above the hard max.
  await expect(panel.getByTestId("driver-bonus-hard-max")).toContainText("Hard max 1 000,00 kr");
  await panel.getByLabel("Driver bonus limit").fill("1200");
  await expect(panel.getByRole("button", { name: "Save tips & limits" })).toBeDisabled();
  await panel.getByLabel("Driver bonus limit").fill("400");
  await expect(panel.getByRole("list", { name: "Unsaved changes" })).toContainText("Driver bonus limit: 200 → 400 kr");

  // Q29: more than 50 % asks "Are you sure?".
  await panel.getByRole("button", { name: "Save tips & limits" }).click();
  const warning = dialog(page).getByTestId("large-change-warning");
  await expect(warning).toContainText("Sweden · Tip: 10 → 16 kr (+60%)");
  await expect(warning).toContainText("Sweden · Driver bonus limit: 200 → 400 kr (+100%)");
  await dialog(page).getByLabel("Yes, I'm sure").check();
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Tips & limits saved for Sweden/)).toBeVisible();

  await page.reload();
  await expect(panel.getByRole("group", { name: "Tips", exact: true }).getByLabel("Tip 1", { exact: true })).toHaveValue("16");
  await expect(panel.getByRole("group", { name: "Tips", exact: true }).getByLabel("Tip 2 active")).not.toBeChecked();
  await expect(panel.getByLabel("Promo cap", { exact: true })).toHaveValue("80");

  // The Fees tab no longer has its own tips: it shows the country list.
  await page.getByRole("tab", { name: "Fees" }).click();
  await expect(page.getByTestId("fees-tips-moved")).toContainText("16,00");

  // The exported documents read the settings.
  await page.goto("/dispatch?zone=Z001");
  const rider = await appConfig(page, "Rider");
  expect(rider.tips).toEqual([
    { amount: { amountMinor: 1600, currency: "SEK" }, enabled: true },
    { amount: { amountMinor: 2000, currency: "SEK" }, enabled: false },
    { amount: { amountMinor: 3000, currency: "SEK" }, enabled: true },
    { amount: { amountMinor: 4000, currency: "SEK" }, enabled: true },
  ]);
  expect((rider.raiseSteps as { amount: { amountMinor: number } }[]).map((item) => item.amount.amountMinor)).toEqual([5000, 10000, 15000, 25000]);
  expect(rider.promoCap).toEqual({ amountMinor: 8000, currency: "SEK" });
  const driver = await appConfig(page, "Driver");
  expect(driver.driverBonus).toEqual({ defaultLimit: { amountMinor: 40000, currency: "SEK" }, hardMax: { amountMinor: 100000, currency: "SEK" } });

  // My activity has the save, with before and after.
  await page.getByRole("button", { name: "My activity" }).click();
  const row = page.getByRole("list", { name: "Activity list" }).getByRole("listitem").filter({ hasText: "Save tips, raise steps, promo cap and driver bonus limit" }).first();
  await expect(row).toContainText("Done");
  await row.getByRole("button").click();
  await expect(row).toContainText("driver bonus limit 400 kr");
});

test("Q7 FINAL / Q49: payment methods and default languages per country in Settings, in the app configs", async ({ page }) => {
  await session(page);
  await page.goto("/settings");
  const panel = page.getByTestId("country-apps");
  await expect(panel.getByRole("columnheader", { name: "Cash" })).toBeVisible();
  await expect(panel).not.toContainText(/Swish|Klarna|PayPal/);
  await expect(panel).toContainText("one balance per currency");
  await expect(panel.getByLabel("Tunisia rider language")).toHaveValue("fr");
  await panel.getByLabel("Sweden Cash").uncheck();
  await panel.getByLabel("Sweden rider language").selectOption("en");
  await panel.getByLabel("France admin language").selectOption("sv");
  await expect(panel.getByRole("list", { name: "Unsaved payment and language changes" })).toContainText("Sweden: Cash: on → off");
  await panel.getByRole("button", { name: "Save payment methods and languages" }).click();
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(panel.getByText("Payment methods and languages saved.")).toBeVisible();
  await page.reload();
  await expect(panel.getByLabel("Sweden Cash")).not.toBeChecked();
  await expect(panel.getByLabel("Sweden rider language")).toHaveValue("en");

  await page.goto("/dispatch?zone=Z001");
  const rider = await appConfig(page, "Rider");
  expect(rider.paymentMethods).toEqual(["card", "apple_pay", "google_pay"]);
  expect((rider.languages as { default: unknown }).default).toEqual({ rider: "en", driver: "sv", admin: "sv" });
  await page.goto("/dispatch?country=FR&zone=FR-PC");
  const driver = await appConfig(page, "Driver");
  expect(driver.paymentMethods).toEqual(["cash", "card", "apple_pay", "google_pay"]);
  expect((driver.languages as { default: unknown }).default).toEqual({ rider: "fr", driver: "fr", admin: "sv" });
});

test("Q39/Q40/Q44/Q46: max stops, pickup move after accept, no-show share and missed exclusive offers from Dispatch go into the driver config", async ({ page }) => {
  test.setTimeout(90_000);
  await session(page);
  await page.goto("/dispatch?zone=Z001&tab=rides");
  const stops = page.getByRole("region", { name: "Stops", exact: true });
  await expect(stops.getByLabel("Max stops")).toHaveValue("3");
  await stops.getByLabel("Max stops").fill("4");
  const move = page.getByRole("region", { name: "Pickup move after accept" });
  await expect(move.getByLabel("Pickup move limit")).toHaveValue("500");
  await move.getByLabel("Pickup move limit").fill("300");
  const wait = page.getByRole("region", { name: "Waiting at pickup" });
  await wait.getByLabel("Driver's share of the no-show fee").fill("70");
  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "See changes" }).click();
  const list = page.getByRole("list", { name: "Changes not live yet" });
  await expect(list).toContainText("Pickup move after accept (m): 500 → 300");
  await expect(list).toContainText("Driver's share of the no-show fee: 80% → 70%");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Live now/)).toBeVisible();

  // Going offline after missed offers moved to Radar · Exclusive · Reservations › Radar.
  await page.getByRole("tab", { name: "Drivers", exact: true }).click();
  await page.getByTestId("dx-moved-auto-offline").getByRole("link", { name: "Radar rules" }).click();
  await expect(page).toHaveURL(/\/dispatch\/radar\?zone=Z001/);
  const offline = page.getByRole("region", { name: "Go offline automatically" });
  await offline.getByLabel("Offline after offers not accepted").fill("5");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Live now/)).toBeVisible();

  // The first publish already shows "Live now": wait for the second one to reach the driver config.
  const missed = (config: Record<string, unknown>) => (config.offers as { autoOffline: { missedExclusive: number } }).autoOffline.missedExclusive;
  await expect.poll(async () => missed(await appConfig(page, "Driver")), { timeout: 15_000 }).toBe(5);
  const driver = await appConfig(page, "Driver");
  expect(driver.booking).toEqual({ maxStops: 4, maxPickupMoveMeters: 300 });
  expect(missed(driver)).toBe(5);
  const waiting = driver.waiting as { driverSharePct: number; driverShareWaitPct: number; byCategory: Record<string, { freeWaitMin: number; noShowAfterMin: number }> };
  expect([waiting.driverSharePct, waiting.driverShareWaitPct]).toEqual([70, 100]);
  expect(waiting.byCategory.xl).toMatchObject({ freeWaitMin: 3, noShowAfterMin: 3 });
  const rider = await appConfig(page, "Rider");
  expect((rider.booking as { maxStops: number; maxPickupMoveMeters: number })).toMatchObject({ maxStops: 4, maxPickupMoveMeters: 300 });
});

test("Round 2: All features finds the new settings and opens their sections", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?view=features");
  const list = page.getByRole("list", { name: "Features" });
  await page.getByLabel("Find a setting").fill("promo cap");
  await list.getByRole("link", { name: /Promo cap per country/ }).click();
  await expect(page).toHaveURL(/\/pricing\?tab=extras&section=promo-cap/);
  await expect(page.locator("#extras-promo-cap")).toBeInViewport();
  await page.goto("/dispatch?view=features");
  await page.getByLabel("Find a setting").fill("pickup move");
  await list.getByRole("link", { name: /Pickup move after accept/ }).click();
  await expect(page.getByRole("region", { name: "Pickup move after accept" })).toBeInViewport();
  await page.goto("/dispatch?view=features");
  await page.getByLabel("Find a setting").fill("default app languages");
  await list.getByRole("link", { name: /Default app languages per country/ }).click();
  await expect(page).toHaveURL(/\/settings#country-apps/);
  await expect(page.getByTestId("country-apps")).toBeVisible();
});
