import { expect, test, type Page } from "@playwright/test";
import { fakeTripServer, signIn, type TripState } from "./live-fake";

/**
 * Driver group 3 (owner 2026-10-30, Rules decisions/driver-g3.md, contract v0.18.4), the admin parts on live:
 * R1 minutes without position + auto-offline audit lines, R3 no per-driver booked-rides switch, R4 real riders online,
 * R5 the Dispatch live map and the Dashboard show only the server's data (no demo drivers, zones, boosts, queue or texts).
 */
const SHOTS = process.env.G3_SHOTS;
const PREFIX = process.env.G3_PREFIX ?? "after";
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${PREFIX}-${name}.png`, fullPage: false }); };
const PERMS = ["overview.read", "drivers.read", "trips.read", "trips.intervene", "riders.read", "zones.read", "settings.read", "settings.edit", "audit.read", "finance.read"];
const AUTO_OFFLINE = { auditId: "77", at: "2026-10-30T10:00:00Z", actor: "system", actorId: "system", action: "driver.auto_offline", targetType: "driver", targetId: "D1001", reason: "no_position", result: "committed", after: { reason: "no_position", lastFixAt: "2026-10-30T09:54:00Z", minutes: 5 }, requestId: "77" };

async function start(page: Page, init: Partial<TripState> = {}, language = "en", landing = "Dashboard"): Promise<TripState> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const state = await fakeTripServer(page, { admin: { permissions: PERMS, language }, ...init });
  await signIn(page, landing);
  return state;
}

test("R5: the Dispatch live map with nobody online shows 0 online and no demo drivers, zones, boosts, queue or demo text", async ({ page }) => {
  await start(page, { noLiveDrivers: true });
  await page.goto("/dispatch/map");
  const counts = page.getByTestId("live-tick");
  await expect(counts).toContainText("Online 0");
  await shot(page, "dispatch-map-empty");
  await expect(page.getByText("Positions refresh in the demo", { exact: false })).toHaveCount(0);
  await expect(counts).not.toContainText("Airport queue");
  await expect(counts).not.toContainText("Boosts");
  await expect(page.getByRole("list", { name: "Airport queue" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Boosts" })).toHaveCount(0);
  await expect(page.getByLabel("Map layers")).not.toContainText("Airport queue");
  await expect(page.getByLabel("Map layers")).not.toContainText("Boosts");
  await expect(page.getByTestId("live-map").locator(".ops-marker")).toHaveCount(0);
  // The zone map draws the server's zones (GET /admin/zones), never the built-in Stockholm demo set or its activity dots.
  const zoneMap = page.getByTestId("live-zone-map");
  await expect(zoneMap).toHaveAttribute("data-zone-ids", /Z001/);
  await expect(zoneMap).not.toHaveAttribute("data-zone-ids", /op-|boost-|nopick-|kista|BST|NOP|DEP/i);
  await expect(zoneMap).toHaveAttribute("data-activity", "off");
});

test("R5: the Dispatch live map shows the server's online driver and nothing else", async ({ page }) => {
  await start(page);
  await page.goto("/dispatch/map");
  await expect(page.getByTestId("live-tick")).toContainText("Online 1");
  await expect(page.getByRole("list", { name: "Live drivers" })).toContainText("Anna");
  await expect(page.getByTestId("live-map").locator(".ops-marker.driver")).toHaveCount(1);
  await shot(page, "dispatch-map-online");
});

test("R4, R5: the Dashboard reads riders online from the server; no Not connected yet, demo bonus area or moving-driver text", async ({ page }) => {
  await start(page, { ridersOnline: [{ zoneId: "Z001", count: 3 }, { zoneId: "Z002", count: 2 }, { zoneId: "FR-PC", count: 9 }] });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Dashboard" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await shot(page, "dashboard");
  await page.getByRole("tab", { name: "Live", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await shot(page, "dashboard-live");
  await page.getByText(/In the app now/).first().scrollIntoViewIfNeeded();
  await shot(page, "dashboard-riders");
  await expect(page.getByText(/5\s*In the app now/)).toBeVisible();
  await expect(page.getByText("Not connected yet")).toHaveCount(0);
  await expect(page.getByText(/Drivers move every 5 seconds/)).toHaveCount(0);
  await expect(page.getByText(/Arlanda evening/)).toHaveCount(0);
  await page.getByRole("tab", { name: "Insights" }).first().click();
  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await shot(page, "dashboard-insights");
  await expect(page.getByText("Not connected yet")).toHaveCount(0);
});

test("R5: the Swedish Dashboard has no Inte kopplad än and no Förarna flyttar sig", async ({ page }) => {
  await start(page, { ridersOnline: [{ zoneId: "Z001", count: 1 }] }, "sv", "Kontrollpanel");
  await page.waitForLoadState("networkidle");
  await shot(page, "dashboard-sv");
  await page.getByRole("tab", { name: "Live", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await shot(page, "dashboard-sv-live");
  await expect(page.getByText(/1\s*I appen nu/)).toBeVisible();
  await expect(page.getByText("Inte kopplad än")).toHaveCount(0);
  await expect(page.getByText(/Förarna flyttar sig/)).toHaveCount(0);
});

test("R1: an automatic set offline reads as words in the audit (sv/fr in src/live/format.test.ts)", async ({ page }) => {
  await start(page, { audit: [AUTO_OFFLINE] });
  await page.goto("/audit");
  const log = page.getByRole("list", { name: "Audit log" });
  await expect(log).toBeVisible();
  await log.scrollIntoViewIfNeeded();
  await shot(page, "audit");
  await expect(log).toContainText("Set offline automatically");
  await expect(log).toContainText("No position for 5 min");
  await expect(log).toContainText("Movera (automatic)");
  await expect(log).not.toContainText("driver.auto_offline");
});

test("R1: Dispatch › Radar has Set offline after minutes without position, 5 by default", async ({ page }) => {
  await start(page);
  await page.goto("/dispatch/radar?zone=Z001");
  await expect(page.getByText("Go offline automatically").first()).toBeVisible();
  await page.getByText("Go offline automatically").first().scrollIntoViewIfNeeded();
  await shot(page, "dispatch-no-position");
  const field = page.getByLabel("Set offline after minutes without position");
  await expect(field).toHaveValue("5");
});

test("R3: Dispatch › Bookings has no per-driver scheduled rides card on live", async ({ page }) => {
  await start(page);
  await page.goto("/dispatch/bookings?zone=Z001");
  await expect(page.getByTestId("dispatch-section")).toBeVisible();
  await expect(page.getByText("Late cancels").first()).toBeVisible();
  await shot(page, "dispatch-bookings");
  await expect(page.getByRole("region", { name: "Drivers' access to scheduled rides" })).toHaveCount(0);
});
