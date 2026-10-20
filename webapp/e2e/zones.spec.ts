import { expect, test, type Page } from "@playwright/test";

/** Q24: at 1280 px and below the country picker, Inbox and Sign out are in the top bar's "⋯" menu. */
async function topbarMore(page: Page) {
  const more = page.getByRole("button", { name: "More options", exact: true });
  if ((await more.isVisible()) && (await more.getAttribute("aria-expanded")) !== "true") await more.click();
}

async function signIn(page: Page, email = "nora@movera.se") {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("movera");
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Zones" })).toBeVisible();
}

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page, target?: string) {
  const modal = page.locator(".modal.open").last();
  if (target) await modal.getByLabel(`Type ${target} to confirm`).fill(target);
  await modal.getByRole("button", { name: "Confirm" }).click();
}

async function mapReady(page: Page) {
  await page.waitForFunction(() => (window as { __moveraMap?: { generation: number } }).__moveraMap);
}

async function mapGeneration(page: Page) {
  return page.evaluate(() => (window as { __moveraMap?: { generation: number } }).__moveraMap?.generation ?? 0);
}

async function waitForMapMove(page: Page, previous: number) {
  await page.waitForFunction((generation) => {
    const map = (window as { __moveraMap?: { generation: number } }).__moveraMap;
    return !!map && map.generation > generation;
  }, previous);
}

async function mapClick(page: Page, lat: number, lng: number) {
  const host = page.locator(".live-map");
  await host.scrollIntoViewIfNeeded();
  const box = await host.boundingBox();
  if (!box) throw new Error("map missing");
  const point = await page.evaluate(({ lat, lng }) => {
    const map = (window as { __moveraMap?: { project: (lat: number, lng: number) => { x: number; y: number } } }).__moveraMap;
    if (!map) throw new Error("map not ready");
    return map.project(lat, lng);
  }, { lat, lng });
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

async function finishDrawing(page: Page) {
  await page.evaluate(() => {
    const canvas = document.querySelector(".maplibregl-canvas");
    canvas?.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
  });
}

const notice = (page: Page) => page.locator(".zn-map-notice");
const panel = (page: Page) => page.locator(".zn-side");

test("zones follow the country bar, with drawing tools, layers and cities", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  await page.getByRole("link", { name: "Zones" }).click();
  await expect(page).toHaveURL(/\/zones/);
  await expect(page.getByRole("heading", { level: 2, name: "Zones" })).toBeVisible();
  const tools = page.getByRole("toolbar", { name: "Drawing tools" });
  for (const name of ["Move map", "Draw shape", "Rectangle", "Circle", "Free hand", "Edit points", "Cut hole", "Pickup point", "No-stop street", "Measure", "Undo", "Redo"]) {
    await expect(tools.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Layers" }).click();
  await expect(page.getByRole("checkbox", { name: "Online drivers" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Gaps (no zone)" })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Satellite" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Stockholm zones" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Södertälje zones" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show Stockholm · Norrmalm on the map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show Stockholm · Arlanda on the map" })).toBeVisible();
  await expect(panel(page)).toContainText("Stockholm · Norrmalm");
  await mapReady(page);

  await topbarMore(page);
  await page.getByRole("radio", { name: "France" }).click();
  await expect(page).toHaveURL(/country=FR/);
  await expect(page.getByRole("article", { name: "Paris zones" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show Paris · Paris Centre on the map" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Stockholm zones" })).toHaveCount(0);
  await expect(panel(page)).toContainText("Paris · ");
  await topbarMore(page);
  await page.getByRole("radio", { name: "Tunisia" }).click();
  await expect(page.getByRole("button", { name: "Show Tunis · Tunis-Carthage on the map" })).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("A05 draw Östermalm, cut a hole, add Arlanda pickups, review, publish, reload, roll back", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  await page.getByRole("link", { name: "Zones" }).click();
  await mapReady(page);
  const before = await mapGeneration(page);
  await page.getByRole("button", { name: "Show Stockholm · Östermalm on the map" }).click();
  await waitForMapMove(page, before);
  await expect(panel(page)).toContainText("Stockholm · Östermalm");

  await page.getByRole("button", { name: "Draw shape", exact: true }).click();
  await page.waitForTimeout(400);
  const outer: [number, number][] = [[59.34, 18.13], [59.34, 18.17], [59.37, 18.17], [59.37, 18.13]];
  for (const [lat, lng] of outer) await mapClick(page, lat, lng);
  await mapClick(page, outer[0][0], outer[0][1]);
  await finishDrawing(page);
  await expect(notice(page)).toContainText("Updated Östermalm");

  await page.getByRole("button", { name: "Cut hole", exact: true }).click();
  await page.waitForTimeout(500);
  const hole: [number, number][] = [[59.348, 18.142], [59.348, 18.158], [59.362, 18.158], [59.362, 18.142]];
  for (const [lat, lng] of hole) await mapClick(page, lat, lng);
  await mapClick(page, hole[0][0], hole[0][1]);
  await finishDrawing(page);
  await expect(page.locator("[data-holes='1']")).toBeVisible();
  await expect(page.getByText(/1 changes? not published/)).toBeVisible();

  await page.getByRole("link", { name: "Open Stockholm · Arlanda" }).click();
  await expect(page).toHaveURL(/air-arlanda/);
  await page.getByRole("tab", { name: "Pickup points" }).click();
  await page.getByLabel("Pickup name").fill("Terminal 2 door");
  await page.getByLabel("Pickup latitude").fill("59.651");
  await page.getByLabel("Pickup longitude").fill("17.930");
  await page.getByLabel("Pickup instructions").fill("Door 2");
  await page.getByLabel("Pickup photo URL").fill("https://example.invalid/t2.jpg");
  await page.getByRole("button", { name: "Add pickup" }).click();
  await expect(page.getByRole("list", { name: "Pickup points" })).toContainText("Terminal 2 door");
  await page.getByLabel("Pickup name").fill("Terminal 5 door");
  await page.getByLabel("Pickup latitude").fill("59.649");
  await page.getByLabel("Pickup longitude").fill("17.922");
  await page.getByLabel("Pickup instructions").fill("Door 4");
  await page.getByRole("button", { name: "Add pickup" }).click();
  await expect(page.getByRole("list", { name: "Pickup points" })).toContainText("Terminal 5 door");
  await page.locator(".zd-toggle", { hasText: "Only these pickup points" }).click();
  await expect(page.getByRole("checkbox", { name: "Only these pickup points" })).toBeChecked();

  await page.getByRole("link", { name: "All zones" }).click();
  await page.getByRole("button", { name: "See changes and impact (2)" }).click();
  await expect(page.getByRole("region", { name: "Changes and impact" }).or(page.locator(".zn-changes"))).toContainText("Stockholm · Östermalm");
  await expect(page.locator(".zn-changes")).toContainText("pickup points");
  await page.getByRole("button", { name: "Send for review" }).click();
  await confirm(page);
  await expect(notice(page)).toContainText("In review. A different agent can publish.");
  await topbarMore(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Lena Berg · ops" }).click();
  await expect(page.getByLabel("Email")).toHaveValue("lena@movera.se");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Zones" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(page);
  await expect(notice(page)).toContainText("Published version 2.");
  await page.reload();
  await expect(page.locator("[data-versions='2']")).toBeVisible();
  await expect(page.getByText("All published")).toBeVisible();
  await page.getByRole("button", { name: "Show Stockholm · Östermalm on the map" }).click();
  await expect(page.locator("[data-holes='1']")).toBeVisible();
  await page.getByRole("button", { name: "Show Stockholm · Arlanda on the map" }).click();
  await expect(page.locator("[data-pickups='2']")).toBeVisible();
  await page.getByRole("button", { name: "Undo last publish" }).click();
  await confirm(page);
  await expect(notice(page)).toContainText("Rolled back to the previous published zones.");
  await expect(page.locator("[data-versions='3']")).toBeVisible();
  await expect(page.locator("[data-pickups='0']")).toBeVisible();
  await page.getByRole("button", { name: "Show Stockholm · Östermalm on the map" }).click();
  await expect(page.locator("[data-holes='0']")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("a new zone from districts: city first, the city in the name, saved as a draft", async ({ page }) => {
  await session(page);
  await page.goto("/zones?country=FR");
  await mapReady(page);
  await page.getByRole("button", { name: "New zone", exact: true }).click();
  const wizard = page.getByLabel("New zone", { exact: true });
  await wizard.locator(".zn-city", { hasText: "Paris" }).click();
  await expect(wizard.getByRole("heading", { name: "New zone in Paris" })).toBeVisible();
  await expect(wizard.locator(".zn-name em")).toHaveText("Paris ·");
  await wizard.getByLabel("Zone name").fill("Batignolles");
  await expect(wizard.getByLabel("Zone code")).toHaveValue("PAR-BAT");
  await wizard.getByRole("button", { name: "Next: the shape" }).click();
  await wizard.getByRole("radio", { name: /Pick districts/ }).click();
  await wizard.locator(".zn-chips label", { hasText: "Montmartre" }).click();
  await wizard.getByRole("button", { name: "Next: check and save" }).click();
  await expect(wizard.getByLabel("Live checks")).toContainText("overlaps Montmartre");
  await expect(wizard.getByRole("button", { name: "Save as draft" })).toBeDisabled();
  await wizard.getByRole("button", { name: "Back" }).click();
  await wizard.locator(".zn-chips label", { hasText: "Montmartre" }).click();
  await wizard.locator(".zn-chips label", { hasText: "Batignolles" }).click();
  await expect(wizard.getByLabel("Shape", { exact: true })).toContainText("km²");
  await wizard.getByRole("button", { name: "Next: check and save" }).click();
  await expect(wizard.getByLabel("Live checks")).toContainText("No overlap, inside Paris");
  await wizard.getByLabel("Copy settings from").selectOption({ label: "Paris · Montmartre–Nord" });
  await wizard.getByRole("radio", { name: "Set hours" }).click();
  await wizard.getByLabel("Hours", { exact: true }).fill("20:00–06:00");
  await wizard.getByRole("button", { name: "Save as draft" }).click();
  await confirm(page);
  await expect(notice(page)).toContainText("Created Paris · Batignolles. Saved as draft.");
  const card = page.getByRole("list", { name: "Paris zone list" }).getByRole("listitem").filter({ hasText: "Batignolles" });
  await expect(card).toContainText("PAR-BAT");
  await expect(card).toContainText("Draft");
  await expect(panel(page)).toContainText("Paris · Batignolles");
  await page.reload();
  await page.getByRole("link", { name: "Open Paris · Batignolles" }).click();
  await page.getByRole("tab", { name: "Hours and go live" }).click();
  await expect(page.getByLabel("Hours", { exact: true })).toHaveValue("20:00–06:00");
});

test("a zone around an address, live checks, and removing overlaps", async ({ page }) => {
  await session(page);
  await page.goto("/zones");
  await mapReady(page);
  await page.getByRole("article", { name: "Stockholm zones" }).getByRole("button", { name: "New zone in Stockholm" }).click();
  const wizard = page.getByLabel("New zone", { exact: true });
  await wizard.getByRole("radio", { name: /Event/ }).click();
  await wizard.getByLabel("Zone name").fill("Mall of Scandinavia");
  await wizard.getByRole("button", { name: "Next: the shape" }).click();
  await wizard.getByRole("radio", { name: /Address \+ distance/ }).click();
  await wizard.getByLabel("Place").selectOption("Mall of Scandinavia");
  await wizard.getByLabel("Distance around").fill("1");
  await expect(wizard.getByLabel("Shape", { exact: true })).toContainText("3.1");
  await wizard.getByRole("button", { name: "Next: check and save" }).click();
  await expect(wizard.getByLabel("Inside the shape now")).toBeVisible();
  await wizard.getByRole("radio", { name: "At a set time" }).click();
  await expect(wizard.getByRole("alert")).toHaveText("Pick when it goes live.");
  await wizard.getByLabel("Go live at").fill("2099-03-01T06:00");
  await wizard.getByRole("button", { name: "Save as draft" }).click();
  await confirm(page);
  await expect(notice(page)).toContainText("Created Stockholm · Mall of Scandinavia");
  await expect(page.getByRole("list", { name: "Stockholm zone list" }).getByRole("listitem").filter({ hasText: "Mall of Scandinavia" })).toContainText("Scheduled");

  await page.getByRole("article", { name: "Stockholm zones" }).getByRole("button", { name: "New zone in Stockholm" }).click();
  await wizard.getByLabel("Zone name").fill("Hagastaden");
  await wizard.getByRole("button", { name: "Next: the shape" }).click();
  await wizard.getByRole("radio", { name: /Address \+ distance/ }).click();
  await wizard.getByLabel("Place").selectOption("Stockholm Central Station");
  await wizard.getByRole("button", { name: "Next: check and save" }).click();
  await expect(wizard.getByLabel("Live checks")).toContainText("overlaps");
  await wizard.getByRole("button", { name: "Back" }).click();
  await wizard.getByRole("button", { name: "Remove overlaps" }).click();
  await expect(notice(page)).toContainText("Overlaps with other zones removed");
  await wizard.getByRole("button", { name: "Next: check and save" }).click();
  await expect(wizard.getByLabel("Live checks")).not.toContainText("overlaps");
});

test("a circle drawn on the map makes a new zone in Göteborg", async ({ page }) => {
  await session(page);
  await page.goto("/zones");
  await mapReady(page);
  await page.getByRole("article", { name: "Göteborg zones" }).getByRole("button", { name: "New zone in Göteborg" }).click();
  const wizard = page.getByLabel("New zone", { exact: true });
  await wizard.getByLabel("Zone name").fill("Centrum");
  await wizard.getByRole("button", { name: "Next: the shape" }).click();
  const moved = await mapGeneration(page);
  await wizard.getByRole("radio", { name: /Circle/ }).click();
  await waitForMapMove(page, moved).catch(() => undefined);
  await page.waitForTimeout(800);
  await expect(page.getByRole("button", { name: "Circle", exact: true })).toHaveAttribute("aria-pressed", "true");
  await mapClick(page, 57.7089, 11.9746);
  await page.waitForTimeout(150);
  await mapClick(page, 57.7089, 11.995);
  await expect(wizard.getByLabel("Shape", { exact: true })).toContainText("km²");
  await wizard.getByRole("button", { name: "Next: check and save" }).click();
  await wizard.getByRole("button", { name: "Save as draft" }).click();
  await confirm(page);
  await expect(page.getByRole("list", { name: "Göteborg zone list" })).toContainText("Centrum");
  await expect(page.getByRole("list", { name: "Göteborg zone list" })).toContainText("GOT-CEN");
});

test("deleting a zone needs its code typed, and undo brings it back", async ({ page }) => {
  await session(page);
  await page.goto("/zones");
  await mapReady(page);
  await page.getByRole("button", { name: "Show Stockholm · Solna on the map" }).click();
  await expect(panel(page)).toContainText("Stockholm · Solna");
  await panel(page).getByRole("button", { name: "Delete" }).click();
  const modal = page.locator(".modal.open").last();
  await expect(modal.getByRole("button", { name: "Confirm" })).toBeDisabled();
  await confirm(page, "SOL");
  await expect(notice(page)).toContainText("Deleted Solna");
  await expect(page.getByRole("button", { name: "Show Stockholm · Solna on the map" })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show Stockholm · Solna on the map" })).toBeVisible();
});

test("zone page: launch checklist, settings, prices in the country's money, rides between zones", async ({ page }) => {
  await session(page);
  await page.goto("/zones/op-norrmalm");
  await expect(page.getByRole("heading", { level: 2, name: "Stockholm · Norrmalm" })).toBeVisible();
  await expect(page.locator("[data-zone-status]")).toContainText("Status: Published");
  await expect(page.getByLabel("Launch checklist")).toContainText("Ready to go live");
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.locator(".zd-chips").filter({ hasText: "Payment methods" }).locator("label").first().click();
  // Q7 FINAL: five methods (card, Apple Pay, Google Pay, cash, wallet); switch them all off.
  for (let index = 0; index < 4; index += 1) await page.locator(".zd-chips").filter({ hasText: "Payment methods" }).locator("label.on").first().click();
  await expect(page.getByLabel("Launch checklist")).toContainText("Not ready to go live");
  await page.getByRole("tab", { name: "Prices and fees" }).click();
  await expect(page.locator(".num-field").filter({ has: page.getByLabel("Zone fee") })).toContainText("kr");
  await page.getByRole("tab", { name: "Rides between zones" }).click();
  await page.getByRole("radio", { name: "The higher price" }).click();
  await page.locator(".zd-toggle", { hasText: "Rides to other cities" }).click();
  await page.reload();
  await expect(page.getByRole("radio", { name: "The higher price" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("checkbox", { name: "Rides to other cities" })).toBeChecked();
  await page.getByRole("tab", { name: "In the apps" }).click();
  await expect(page.getByText("Rider app")).toBeVisible();

  await page.goto("/zones/op-fr-pc?tab=prices");
  await expect(page.getByRole("heading", { level: 2, name: "Paris · Paris Centre" })).toBeVisible();
  await expect(page.locator(".num-field").filter({ has: page.getByLabel("Zone fee") })).toContainText("€");
});

test("zones stay usable at 390px", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 860 });
  await page.goto("/zones");
  await mapReady(page);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(392);
  await expect(page.getByRole("button", { name: "Draw shape", exact: true })).toBeVisible();
  await page.goto("/zones/op-norrmalm");
  const detailWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(detailWidth).toBeLessThanOrEqual(392);
});
