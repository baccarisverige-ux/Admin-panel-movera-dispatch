import { expect, test, type Page } from "@playwright/test";

/**
 * Round 3 assign tool (owner Q13–Q18, contract §3.1): nearby drivers, direct assign (exclusive offer), radar groups
 * of up to 10 drivers sent again and again, the lock once a driver accepts, and "Add money for driver".
 * Demo drivers always answer the same way (dispatch/assign.ts demoReply): near T0004 (Oscar Wallin, searching),
 * D0046 accepts, D0042 and D0006 decline, D0022 and D0058 never answer.
 */

const SHOTS = process.env.R3_SHOTS ?? "";

async function session(page: Page, agentId = "lena") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

const panel = (page: Page) => page.getByTestId("assign-panel");
const row = (page: Page, driverId: string) => panel(page).locator(`tr[data-driver="${driverId}"]`);
const confirmDialog = (page: Page) => page.locator(".modal.open").last();

test("Trips list: the rider's name opens the assign panel; a direct assign is an exclusive offer the driver declines", async ({ page }) => {
  test.setTimeout(60_000);
  await session(page);
  await page.goto("/trips");
  await page.getByLabel("Search this table").fill("T0004");
  await page.getByRole("button", { name: "Oscar Wallin, assign a driver" }).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByTestId("assign-trip-status")).toHaveText("Searching");
  // Q14: presets, custom, whole zone and the zones around it.
  for (const name of ["5 km", "7 km", "10 km", "Custom", "Whole zone", "Zone + neighbours"]) await expect(panel(page).getByRole("button", { name, exact: true })).toBeVisible();
  await expect(row(page, "D0042")).toContainText("Online");
  await expect(row(page, "D0042")).toContainText(/\d+(\.\d)? km/);
  await expect(row(page, "D0042")).toContainText("min");
  await panel(page).getByRole("button", { name: "Whole zone" }).click();
  await expect(row(page, "D0042")).toHaveCount(0);
  await expect(row(page, "D0022")).toBeVisible();
  await panel(page).getByRole("button", { name: "Custom" }).click();
  await panel(page).getByLabel("Custom distance in km").fill("0");
  await expect(panel(page).getByRole("alert")).toContainText("The distance must be 0.1 to 100 km.");
  await panel(page).getByLabel("Custom distance in km").fill("6");
  await expect(row(page, "D0042")).toBeVisible();
  await shot(page, "01-assign-panel-nearby");

  // Q16: click a driver, confirm: an exclusive offer.
  await row(page, "D0042").getByRole("button", { name: /^Assign / }).click();
  await expect(confirmDialog(page)).toContainText("Send an exclusive offer for Oscar Wallin to Freja Ek");
  await confirmDialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(panel(page).getByText("Exclusive offer sent to Freja Ek.")).toBeVisible();
  await expect(row(page, "D0042").locator("[data-status]")).toHaveAttribute("data-status", "open");
  await expect(row(page, "D0042")).toContainText("Sent");
  await expect(panel(page).getByTestId("assign-trip-status")).toHaveText("Offered");
  await expect(panel(page).getByRole("list", { name: "Offers" })).toContainText("Direct assign (exclusive)");
  await shot(page, "02-direct-assign-sent");
  // The driver declines: the trip goes back to searching and can be assigned again.
  await expect(row(page, "D0042").locator("[data-status]")).toHaveAttribute("data-status", "declined", { timeout: 15_000 });
  await expect(row(page, "D0042")).toContainText("Declined");
  await expect(panel(page).getByTestId("assign-trip-status")).toHaveText("Searching");
  await expect(panel(page).getByRole("list", { name: "Dispatch events" })).toContainText("Offer declined · Freja Ek");
  await expect(row(page, "D0042").getByRole("button", { name: /^Assign / })).toBeEnabled();
  await shot(page, "03-direct-assign-declined");

  // Every action is in My activity.
  await panel(page).getByRole("button", { name: "Close" }).click();
  await page.goto("/dispatch?view=activity");
  await expect(page.getByText("Assign to a driver (exclusive offer)").first()).toBeVisible();
});

test("Trip page: radar groups again and again until one accepts, then the assignment locks", async ({ page }) => {
  test.setTimeout(60_000);
  await session(page);
  await page.goto("/trips/T0004");
  await page.getByTestId("trip-assign").getByRole("button", { name: "Nearby drivers for Oscar Wallin" }).click();
  await expect(panel(page)).toBeVisible();

  // Group 1: two drivers on the zone's radar timer, with a countdown.
  await row(page, "D0006").getByRole("checkbox").check();
  await row(page, "D0022").getByRole("checkbox").check();
  await expect(panel(page).getByText(/2 of 10 selected/)).toBeVisible();
  await panel(page).getByRole("button", { name: "Send to radar" }).click();
  await expect(panel(page).getByText("Sent to the radar of 2 drivers.")).toBeVisible();
  await expect(panel(page).getByTestId("group-countdown-1")).toContainText(/0:1\d left/);
  await expect(row(page, "D0022").getByRole("checkbox")).toBeDisabled();
  await shot(page, "04-radar-group-1");
  await expect(row(page, "D0006").locator("[data-status]")).toHaveAttribute("data-status", "declined", { timeout: 15_000 });

  // Group 2 while group 1 still runs: the first to accept wins.
  await row(page, "D0046").getByRole("checkbox").check();
  await panel(page).getByRole("button", { name: "Send to radar" }).click();
  await expect(panel(page).getByText("Sent to the radar of 1 driver.")).toBeVisible();
  await expect(panel(page).locator('[data-group="T0004-G2"]')).toBeVisible();

  // Q13 lock: status changes, the panel locks, the other open offers are withdrawn.
  const locked = panel(page).getByTestId("assign-locked");
  await expect(locked).toContainText("Assigned to Ella Holm", { timeout: 15_000 });
  await expect(panel(page).getByTestId("assign-trip-status")).toHaveText("Accepted");
  await expect(panel(page).locator('[data-group="T0004-G1"] [data-driver="D0022"] [data-status]')).toHaveAttribute("data-status", "claimed_elsewhere");
  await expect(panel(page).locator('[data-group="T0004-G2"] [data-driver="D0046"]')).toContainText("Accepted");
  await expect(panel(page).getByRole("button", { name: "Send to radar" })).toBeDisabled();
  await expect(row(page, "D0058").getByRole("button", { name: /^Assign / })).toBeDisabled();
  await expect(panel(page).getByRole("list", { name: "Dispatch events" })).toContainText("Assignment locked · Ella Holm");
  await shot(page, "05-radar-accepted-locked");
  await panel(page).getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("trip-assign")).toContainText("Assigned to Ella Holm");
  await expect(page.getByRole("heading", { name: "Trip T0004" }).locator("..")).toContainText("Accepted");
  await shot(page, "06-trip-page-locked");

  await page.goto("/dispatch?view=activity");
  await expect(page.getByText("Send to a radar group").first()).toBeVisible();
});

test("Add money for driver: Q17 limits with a link to Pricing, Movera pays it even past its commission", async ({ page }) => {
  await session(page);
  await page.goto("/trips/T0004");
  const box = page.getByTestId("trip-assign").getByTestId("driver-bonus-box");
  await expect(box).toContainText("Limit 200,00 kr per trip");
  await box.getByLabel("Money for the driver").fill("250");
  await expect(box.getByTestId("driver-bonus-issue")).toContainText("adjust the limit in Pricing");
  await expect(box.getByRole("button", { name: "Add money" })).toBeDisabled();
  await box.getByLabel("Money for the driver").fill("1200");
  await expect(box.getByTestId("driver-bonus-issue")).toContainText("hard max of 1 000,00 kr");
  await box.getByLabel("Money for the driver").fill("250");
  await shot(page, "07-bonus-over-limit");
  await box.getByLabel("Money for the driver").fill("150");
  await expect(box.getByTestId("driver-bonus-beyond")).toContainText("more than its commission");
  await box.getByRole("button", { name: "Add money" }).click();
  await expect(confirmDialog(page)).toContainText("Add 150,00 kr for the driver on T0004");
  await confirmDialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(box.getByTestId("driver-bonus-now")).toContainText("150,00 kr");
  await expect(box.getByTestId("driver-bonus-now")).toContainText("Priority");
  await expect(page.getByTestId("split-driver-bonus")).toContainText("150,00 kr");
  await expect(page.getByTestId("split-beyond-commission")).toBeVisible();
  // 100 more passes the 200 kr limit for the trip.
  await box.getByLabel("Money for the driver").fill("100");
  await expect(box.getByTestId("driver-bonus-issue")).toContainText("adjust the limit in Pricing");
  await shot(page, "08-bonus-added");

  // Offers sent now carry the bonus and the Priority badge (Q18).
  await page.getByTestId("trip-assign").getByRole("button", { name: "Nearby drivers for Oscar Wallin" }).click();
  await row(page, "D0058").getByRole("checkbox").check();
  await panel(page).getByRole("button", { name: "Send to radar" }).click();
  const offer = panel(page).locator('[data-group="T0004-G1"] [data-driver="D0058"]');
  await expect(offer).toContainText("incl. +150,00 kr");
  await expect(offer.getByText("Priority")).toBeVisible();
  await shot(page, "09-offer-with-bonus");
  await panel(page).getByRole("button", { name: "Close" }).click();

  await page.getByTestId("trip-assign").getByRole("link", { name: "Pricing › Tips & limits" }).click();
  await expect(page).toHaveURL(/\/pricing\?tab=extras&section=driver-bonus/);
});

test("Dispatch live: a waiting rider's name and the map popup open the assign panel; All features lists the tools", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?view=live");
  const waiting = page.getByRole("list", { name: "Riders waiting" });
  const name = waiting.getByRole("button", { name: /, assign a driver$/ }).first();
  const label = (await name.getAttribute("aria-label")) ?? "";
  await name.click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("aria-label", `Assign ${label.replace(/, assign a driver$/, "")}`);
  await shot(page, "10-dispatch-live-panel");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await waiting.getByRole("button", { name: "See on map" }).first().click();
  const popup = page.getByRole("dialog", { name: /^Rider / });
  await popup.getByRole("button", { name: /^Nearby drivers for / }).click();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/dispatch?view=features");
  await page.getByLabel("Find a setting").fill("radar group");
  const list = page.getByRole("list", { name: "Features" });
  await expect(list).toContainText("Radar groups of up to 10 drivers");
  await expect(list).toContainText("Radar group timer (the zone's radar time)");
  await page.getByLabel("Find a setting").fill("add money");
  await expect(list).toContainText("Add money for driver (Movera pays)");
  await page.getByLabel("Find a setting").fill("assign tool");
  await expect(list).toContainText("Assign tool: nearby drivers and direct assign");
});
