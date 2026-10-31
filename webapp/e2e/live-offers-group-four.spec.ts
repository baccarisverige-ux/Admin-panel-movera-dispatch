import { expect, test, type Page, type Route } from "@playwright/test";
import { ACTIVE_TRIP, ADMIN, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * Driver group 4 "Incoming offer & exclusive offer" (contract v0.18.6, Rules decisions/driver-g4.md and
 * decisions/admin-fake-by-group.md), the admin parts on live:
 * - G4-E4 rider raise limit per zone (DispatchDocument.raisePrice.maxFactor) is read from and saved to the server;
 * - decision 3 "Show rider rating on offers" follows the zone's driver document (offers.offerCard.riderRating);
 * - G4-E2/E3 the auto-offline rule text is the contract's (limit 10, hand-sent offers count); G4-E7 no reasons editor;
 * - the G4 demo-only tools (events, driver groups, radar zones and rules, saved presets, second-admin approvals, cancel
 *   checks, the demo "Cancel request") are not offered on live: no demo data and no "Not connected yet".
 * With G4_SHOTS set, screenshots are saved there.
 */

const SHOTS = process.env.G4_SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); };
const G4_ADMIN = { permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "dispatch.edit", "trips.intervene"] };
const SEARCHING = { ...ACTIVE_TRIP, tripId: "T2003", status: "searching", version: 2, driverId: undefined, driver: undefined, acceptedAt: undefined, riderId: "R501", createdAt: new Date(Date.now() - 4 * 60_000).toISOString() };

const confirm = async (page: Page) => {
  const modal = page.locator(".modal.open").last();
  const reason = modal.getByLabel(/^(Reason|Skäl)$/);
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: /^(Confirm|Bekräfta)$/ }).click();
};

/** Nearby drivers for the waiting trip (no rating: the server sends none) and the assign call. */
async function fakeNearby(page: Page) {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "access-control-expose-headers": "*" };
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
  const assigns: unknown[] = [];
  await page.route(/\/api\/v1\/admin\/trips\/[^/]+\/(nearby-drivers|assign)(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (request.url().includes("/nearby-drivers")) {
      return json(route, 200, { scope: "zone", items: [{ driverId: "D1001", firstName: "Anna", onlineStatus: "online", location: { lat: 59.333, lng: 18.064, measuredAt: new Date().toISOString() }, distanceMeters: 900, pickupEtaSeconds: 180, zoneId: "Z001", categoryIds: ["standard"] }] });
    }
    assigns.push(request.postDataJSON());
    return json(route, 200, { ...SEARCHING, status: "offered", version: 3 });
  });
  return assigns;
}

async function open(page: Page, path: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: G4_ADMIN, trips: [{ ...SEARCHING }] as never });
  const settings = await fakeSettings(page);
  const assigns = await fakeNearby(page);
  // Södermalm (Z002) has its own documents on the server: raise limit 1.5×, rider rating off.
  const dispatch = settings.docs.get("dispatch:Z002")!;
  settings.docs.set("dispatch:Z002", { ...dispatch, document: { ...dispatch.document, raisePrice: { maxFactor: 1.5 } } });
  const driver = settings.docs.get("driver_app_config:Z002")!;
  const offers = (driver.document["offers"] ?? {}) as Record<string, unknown>;
  settings.docs.set("driver_app_config:Z002", { ...driver, document: { ...driver.document, offers: { ...offers, offerCard: { ...((offers["offerCard"] ?? {}) as object), riderRating: false } } } });
  await signIn(page, "Dashboard");
  await page.goto(path);
  return { settings, assigns };
}

test("G4-E4 and decision 3: the zone's rider raise limit and rider rating switch come from the server, and the limit is saved with the dispatch document", async ({ page }) => {
  const { settings } = await open(page, "/dispatch?zone=Z002");
  const raise = page.getByRole("region", { name: "Rider raise limit" });
  await expect(raise.getByLabel("Rider raise limit")).toHaveValue("1.5");
  await expect(raise).toContainText("From 1× to 3×.");
  await expect(page.getByRole("region", { name: "Offer card" }).getByLabel("Show rider rating on offers on")).not.toBeChecked();
  await shot(page, "live-dispatch-raise-limit-rating");
  await raise.getByLabel("Rider raise limit").fill("2.5");
  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect.poll(() => settings.sent.filter((s) => s.method === "POST").map((s) => s.path)).toContain("/api/v1/admin/config/dispatch/publish");
  const put = settings.sent.find((s) => s.method === "PUT" && s.path.endsWith("/admin/config/dispatch"))!;
  expect((put.body!["document"] as Record<string, unknown>)["raisePrice"]).toEqual({ maxFactor: 2.5 });
  expect(put.body!["zoneId"]).toBe("Z002");
});

test("G4-E2/E3/E7: Radar shows the contract's rule text with 10 (hand-sent offers count); Exclusive has no reasons editor; no demo radar zones or groups", async ({ page }) => {
  await open(page, "/dispatch/radar?zone=Z001");
  const offline = page.getByRole("region", { name: "Go offline automatically" });
  await expect(offline).toContainText("The driver goes offline after 10 missed or declined Exclusive or hand-sent offers in a row (Radar does not count).");
  await expect(page.getByLabel("Offline after offers not accepted")).toHaveValue("10");
  await expect(page.getByRole("region", { name: "Radar zones" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Radar zone rules" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Driver groups" })).toHaveCount(0);
  await offline.scrollIntoViewIfNeeded();
  await shot(page, "live-radar-auto-offline");
  await page.goto("/dispatch/radar?tab=exclusive&zone=Z001");
  await expect(page.getByRole("region", { name: "Exclusive" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Exclusive reasons" })).toHaveCount(0);
  await expect(page.getByText("Not connected yet")).toHaveCount(0);
});

test("G4 live admin: no Events & groups or Cancel checks tabs, no demo concert, no second-admin approvals, presets without Save", async ({ page }) => {
  await open(page, "/dispatch?zone=Z001");
  const views = page.getByRole("tablist", { name: "Dispatch sections" });
  await expect(views.getByRole("tab", { name: "Rules" })).toBeVisible();
  await expect(views.getByRole("tab", { name: "Events & groups" })).toHaveCount(0);
  await expect(views.getByRole("tab", { name: "Cancel checks" })).toHaveCount(0);
  await page.getByRole("button", { name: "Presets" }).click();
  const presets = page.locator(".modal.open");
  await expect(presets.getByRole("list", { name: "Presets" })).toBeVisible();
  await expect(presets.getByRole("button", { name: "Save preset" })).toHaveCount(0);
  await expect(presets.getByText("Yours")).toHaveCount(0);
  await shot(page, "live-dispatch-presets");
  await presets.getByRole("button", { name: /Close/ }).first().click();
  // An old link to the Events view lands on the rules, never on demo data.
  await page.goto("/dispatch?view=events");
  await expect(page.getByText("Concert at Friends Arena")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Waiting for a second admin" })).toHaveCount(0);
  await page.goto("/dispatch?view=history");
  await expect(page.getByRole("region", { name: "Waiting for a second admin" })).toHaveCount(0);
});

test("G4 send offer by hand on live: the exclusive offer goes to the server; radar goes to zones only; no Cancel request, no 'Not connected yet'", async ({ page }) => {
  const { assigns } = await open(page, "/dispatch?view=live");
  await page.getByRole("button", { name: /^Nearby drivers for / }).first().click();
  const panel = page.getByTestId("assign-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Not connected yet")).toHaveCount(0);
  const radar = panel.getByTestId("radar-target");
  await expect(radar.getByRole("button", { name: "Zones" })).toBeVisible();
  await expect(radar.getByRole("button", { name: "Radar zones" })).toHaveCount(0);
  await expect(radar.getByRole("button", { name: "Driver groups" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Cancel request/ })).toHaveCount(0);
  await shot(page, "live-assign-panel");
  await panel.getByRole("button", { name: /^Assign Anna/ }).click();
  await confirm(page);
  await expect.poll(() => assigns.length).toBe(1);
  expect(assigns[0]).toMatchObject({ expectedVersion: 2, driverId: "D1001" });
  // The demo's own "sent by" record is not sent on live (it has no server path).
  await expect(page.getByText("Not connected yet")).toHaveCount(0);
});
