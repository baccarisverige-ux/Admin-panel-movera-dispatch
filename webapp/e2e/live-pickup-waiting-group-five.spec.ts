import { expect, test, type Page } from "@playwright/test";
import { ACTIVE_TRIP, ADMIN, CANCELLED_TRIP, COMPLETED_TRIP, RIDERS, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * Driver group 5 "Going to pickup & waiting" (contract v0.18.7, Rules decisions/driver-g5.md), the admin parts on live
 * against a faked server:
 * - Q2 "Cancel after the driver arrived counts as a no-show" and item 4 pickup move limit (0–2000, default 200) per
 *   zone, read from and published to the zone's driver document.
 * - Status item 10 / adminLiveRow: the live trips row shows the server's ETA and distance with a map link; the trip
 *   page shows the ETA, the car on the map, the rider's first name and rating, the terms, the cancel fee in words
 *   (which rule, owed or paid, the driver's share) and waives it; the rider page shows the debt per currency.
 * - The live map plots the trip at the car and counts only online drivers; a deep link opens the trip.
 */

const G5_ADMIN = { permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "dispatch.edit", "trips.intervene"] };
const SEK = (amountMinor: number) => ({ amountMinor, currency: "SEK" });
const ETA_AT = () => new Date().toISOString();

/** Anna on her way to Omar: the server's ETA (4 min, 1.2 km) and her position; the rider summary and the terms. */
const TO_PICKUP = {
  ...ACTIVE_TRIP, tripId: "T2002", status: "driver_to_pickup", version: 5,
  driverLocation: { lat: 59.3345, lng: 18.0632, accuracy: 6, measuredAt: ETA_AT() },
  eta: { etaSeconds: 230, distanceMeters: 1249, target: "pickup", at: ETA_AT(), source: "osrm" },
  etaSeconds: 230,
  rider: { firstName: "Omar", rating: 4.83 },
  terms: { currency: "SEK", freeWaitMin: 5, waitPerMin: SEK(1226), noShowAfterMin: 5, noShowFee: SEK(6500), noShowDriverSharePct: 80, cancelRule: { freeMin: 2, fee: SEK(3500) }, cancelDriverSharePct: 100, cancelAfterArrivedIsNoShow: true, maxPickupMoveMeters: 200 },
};

/** Ida cancelled after Anna had arrived: the no-show fee, owed (cash), the driver's share credited. */
const NO_SHOW_CANCEL = {
  ...CANCELLED_TRIP, tripId: "T2003", status: "cancelled_by_rider", version: 4, riderId: "R502", driverId: "D1001", vehicleId: "V1", driver: COMPLETED_TRIP.driver,
  acceptedAt: "2026-10-26T07:01:00Z", fare: SEK(6500), fareLines: [{ code: "cancel_fee", amount: SEK(6500) }], paymentMethod: "cash", paymentStatus: "pending",
  rider: { firstName: "Omar", rating: 4.83 },
  terms: TO_PICKUP.terms,
  cancellation: { actor: "rider", reasonCode: "plans_changed", at: "2026-10-26T07:09:00Z", fee: SEK(6500), feeStatus: "owed", feeKind: "no_show", driverShare: SEK(5200) },
};

/** Omar owes 49 kr from before and the 65 kr no-show fee in Sweden, and 10 € in France (Q3: never summed across currencies). */
const OMAR = { ...RIDERS[1], outstanding: SEK(11400), outstandingByCurrency: [SEK(11400), { amountMinor: 1000, currency: "EUR" }] };

async function open(page: Page, path: string, trips: Array<Record<string, unknown>> = [{ ...COMPLETED_TRIP }, { ...TO_PICKUP }, { ...NO_SHOW_CANCEL }]) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await fakeTripServer(page, { admin: G5_ADMIN, trips: trips as never, riders: [{ ...RIDERS[0] }, { ...OMAR }] });
  const settings = await fakeSettings(page);
  await signIn(page, "Dashboard");
  await page.goto(path);
  return { state, settings };
}

const confirm = async (page: Page) => {
  const modal = page.locator(".modal.open").last();
  const reason = modal.getByLabel(/^(Reason|Skäl)$/);
  if ((await reason.count()) && (await reason.inputValue()) === "") {
    const tag = await reason.evaluate((node) => node.tagName);
    if (tag === "SELECT") await reason.selectOption({ index: 1 });
    else await reason.fill("Goodwill after the rider called");
  }
  await modal.getByRole("button", { name: /^(Confirm|Bekräfta)$/ }).click();
};

test("Q2 + item 4: the zone's cancel-after-arrived switch and pickup move limit come from the driver document and publish back to it; the box carries the contract's 0–2000 bounds", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: G5_ADMIN });
  const settings = await fakeSettings(page);
  // Södermalm (Z002) has its own driver document: the switch off, the move limit 350 m.
  const driver = settings.docs.get("driver_app_config:Z002")!;
  settings.docs.set("driver_app_config:Z002", { ...driver, document: { ...driver.document, waiting: { ...(driver.document["waiting"] as object), cancelAfterArrivedIsNoShow: false }, booking: { ...(driver.document["booking"] as object), maxPickupMoveMeters: 350 } } });
  await signIn(page, "Dashboard");
  await page.goto("/dispatch?zone=Z002&tab=rides");
  const wait = page.getByRole("region", { name: "Waiting at pickup" });
  const toggle = wait.getByLabel("Cancel after the driver arrived counts as a no-show on");
  await expect(toggle).not.toBeChecked();
  // The contract's own words (sv/fr/en) under the switch, not retyped.
  await expect(wait).toContainText("Cancelling after the driver has arrived and the free waiting is over counts as a no-show (no-show fee)");
  await expect(wait).toContainText("Pricing wins");
  const move = page.getByRole("region", { name: "Pickup move after accept" });
  const box = move.getByLabel("Pickup move limit");
  await expect(box).toHaveValue("350");
  await expect(box).toHaveAttribute("min", "0");
  await expect(box).toHaveAttribute("max", "2000");
  await expect(box).toHaveAttribute("step", "10");
  await expect(move).toContainText("Usual value 200 m");
  await box.fill("2500");
  await expect(box).toHaveAttribute("aria-invalid", "true");
  await box.fill("300");
  await expect(box).not.toHaveAttribute("aria-invalid", "true");
  await toggle.check();
  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "See changes" }).click();
  const list = page.getByRole("list", { name: "Changes not live yet" });
  await expect(list).toContainText("Pickup move after accept (m): 350 → 300");
  await expect(list).toContainText("Cancel after the driver arrived counts as a no-show");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect.poll(() => settings.sent.filter((s) => s.method === "POST").map((s) => s.path)).toContain("/api/v1/admin/config/driver_app_config/publish");
  const put = settings.sent.find((s) => s.method === "PUT" && s.path.endsWith("/admin/config/driver_app_config") && s.body!["zoneId"] === "Z002")!;
  const doc = put.body!["document"] as Record<string, Record<string, unknown>>;
  expect(doc["waiting"]["cancelAfterArrivedIsNoShow"]).toBe(true);
  expect(doc["booking"]["maxPickupMoveMeters"]).toBe(300);
  // The waiting money is still the server's (Pricing wins when served), not retyped by the admin.
  expect(doc["waiting"]["perMin"]).toEqual((driver.document["waiting"] as Record<string, unknown>)["perMin"]);
});

test("status item 10: the live trips row shows the server's ETA and distance with a map link; a rider still searching shows no ETA", async ({ page }) => {
  await open(page, "/trips");
  const row = page.getByTestId("trip-live-T2002");
  await expect(row).toContainText("Driver to pickup");
  await expect(row).not.toContainText("driver_to_pickup");
  await expect(row).toContainText("4 min · 1.2 km");
  await row.getByRole("link", { name: "Map of T2002" }).click();
  await expect(page).toHaveURL(/\/trips\/T2002#route$/);
  await expect(page.getByTestId("trip-eta")).toContainText("4 min · 1.2 km");
  await expect(page.getByTestId("trip-eta")).not.toContainText("old position");
  await expect(page.getByTestId("trip-route")).not.toContainText("Not connected yet");
  // The map draws the car and its way (the maplibre canvas needs WebGL; the facts list is what we check).
  await expect(page.getByTestId("trip-route-facts")).toContainText("To the pickup");
  // The rider's first name and rating as the driver sees them (Q1); the terms (owner rule 16: all from the server).
  await expect(page.getByTestId("trip-rider-rating")).toContainText("4.8");
  const terms = page.getByTestId("trip-terms");
  await expect(terms).toContainText("5 min · 12,26 kr/min");
  await expect(terms).toContainText("65,00 kr (driver gets 80%)");
  await expect(terms).toContainText("counts as a no-show");
  await expect(terms).toContainText("up to 200 m");
  // The top cards: distance and minutes to the pickup, from the server, not "Not connected yet".
  await expect(page.getByText("To the pickup, km")).toBeVisible();
});

test("Q2 / Q6 / Q3: the cancelled trip shows the reason in words, the no-show fee owed with the driver's share; Waive sends it to the server and the rider's debt per currency drops", async ({ page }) => {
  const { state } = await open(page, "/trips/T2003");
  await expect(page.getByTestId("trip-cancel-words")).toContainText("Rider");
  await expect(page.getByTestId("trip-cancel-words")).not.toContainText("Not connected yet");
  await expect(page.getByTestId("trip-cancel-words")).toContainText("Plans changed");
  await expect(page.getByTestId("trip-cancel-words")).not.toContainText("plans_changed");
  const fee = page.getByTestId("trip-cancel-fee");
  await expect(fee).toContainText("No-show fee");
  await expect(fee).toContainText("65,00 kr");
  await expect(fee.getByTestId("trip-fee-status")).toContainText("owed");
  await expect(fee).toContainText("52,00 kr");
  await expect(page.getByTestId("trip-cancel-fee-line")).toContainText("65,00 kr (no-show fee) · owed");
  await expect(page.getByTestId("trip-cancel-fee-line")).toContainText("driver gets 52,00 kr");
  // Before the waive: Omar owes 114 kr in Sweden and 10 € in France, shown apart (never 124 of anything).
  await page.goto("/riders/R502");
  const owed = page.getByTestId("rider-owed");
  await expect(owed).toContainText("Owes 114,00 kr · 10,00 €");
  await expect(owed).not.toContainText("payment failed");
  await expect(owed.getByRole("list", { name: "Owed fees" })).toContainText("T2003");
  await owed.getByRole("button", { name: "Waive the fee" }).click();
  await confirm(page);
  await expect.poll(() => state.calls.filter((call) => call.method === "POST" && call.path.endsWith("/admin/trips/T2003/adjust")).length).toBe(1);
  const sent = state.calls.find((call) => call.method === "POST" && call.path.endsWith("/admin/trips/T2003/adjust"))!.body as Record<string, unknown>;
  expect(sent["waiveCancelFee"]).toBe(true);
  expect(sent["expectedVersion"]).toBe(4);
  expect(sent["reason"]).toBe("Planned change"); // the reason the admin picked in the dialog, sent as is
  const waiveCall = state.calls.find((call) => call.method === "POST" && call.path.endsWith("/admin/trips/T2003/adjust"))!;
  expect(waiveCall.headers["idempotency-key"]).toBeTruthy();
  await expect(page.getByRole("status")).toContainText("Fee waived");
  await page.goto("/trips/T2003");
  await expect(page.getByTestId("trip-cancel-fee").getByTestId("trip-fee-status")).toContainText("waived");
  await expect(page.getByRole("button", { name: "Waive the fee" })).toHaveCount(0);
  await page.goto("/riders/R502");
  await expect(page.getByTestId("rider-owed")).toContainText("Owes 49,00 kr · 10,00 €");
  await page.goto("/riders");
  await expect(page.getByTestId("rider-owed-badge").first()).toContainText("Owes 49,00 kr · 10,00 €");
});

test("live map bug: the trip is plotted at the car with its ETA and the online count is the online drivers; a deep link opens the trip", async ({ page }) => {
  await open(page, "/dispatch/map");
  const counts = page.getByTestId("live-tick");
  await expect(counts).toContainText("Online 1.");
  await expect(counts).toContainText("Trips on the map 1 of 1 active.");
  const map = page.getByTestId("live-map");
  await expect(map.getByRole("button", { name: /T2002 · .*4 min · 1\.2 km/ })).toBeVisible();
  await map.getByRole("button", { name: /T2002 · / }).click();
  await expect(page.getByTestId("live-panel")).toContainText("T2002");
  // GitHub Pages' 404 page keeps the page in ?p=; the app opens that page, not the Dashboard.
  await page.goto("/?p=%2Ftrips%2FT2001");
  await expect(page).toHaveURL(/\/trips\/T2001$/);
  await expect(page.getByRole("heading", { level: 2, name: "Trip T2001" })).toBeVisible();
});

test("owner 2026-10-31: the driver bonus box shows the country's real limits from the server and 'Change limit' opens that field, focused", async ({ page }) => {
  const searching = { ...ACTIVE_TRIP, tripId: "T2004", status: "searching", version: 2, driverId: undefined, driver: undefined, acceptedAt: undefined, riderId: "R501", createdAt: new Date(Date.now() - 2 * 60_000).toISOString() };
  const { settings } = await open(page, "/trips/T2004", [{ ...searching }]);
  const box = page.getByTestId("driver-bonus-box");
  // fakeSettings' country_rules: driverBonus 200 kr per trip, hard max 1 000 kr (never 0 any more).
  await expect(box.getByTestId("driver-bonus-limit")).toContainText("200,00 kr");
  await expect(box.getByTestId("driver-bonus-limit")).toContainText("1 000,00 kr");
  await expect(box.getByLabel("Money for the driver")).toHaveAttribute("placeholder", /200,00 kr/);
  // Checker round 2 (M1): the offers are re-read every second, the country rules once (kept 5 min).
  await page.waitForTimeout(4000);
  expect(settings.sent.filter((s) => s.method === "GET" && s.path.startsWith("/api/v1/admin/config/country_rules?zoneId=Z001")).length).toBe(1);
  await box.getByTestId("driver-bonus-change-limit").click();
  await expect(page).toHaveURL(/\/pricing\?tab=extras&section=driver-bonus&focus=driverBonusLimit&country=SE&zone=Z001/);
  await expect(page.locator("#driver-bonus-limit-input")).toBeFocused();
});

test("owner 2026-10-31: an admin who cannot change Pricing sees the limit text but no Change limit button", async ({ page }) => {
  const searching = { ...ACTIVE_TRIP, tripId: "T2004", status: "searching", version: 2, driverId: undefined, driver: undefined, acceptedAt: undefined, riderId: "R501", createdAt: new Date(Date.now() - 2 * 60_000).toISOString() };
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: { permissions: [...ADMIN.permissions, "trips.intervene"] }, trips: [searching] as never });
  await fakeSettings(page);
  await signIn(page, "Dashboard");
  await page.goto("/trips/T2004");
  await expect(page.getByTestId("driver-bonus-limit")).toContainText("200,00 kr");
  await expect(page.getByTestId("driver-bonus-change-limit")).toHaveCount(0);
});

test("checker round 2 (M2): a zone the panel does not know takes its country from the trip's currency (euro → France), never Swedish values", async ({ page }) => {
  const odd = { ...ACTIVE_TRIP, tripId: "T2005", zoneId: "FR-ZZ", status: "searching", version: 2, driverId: undefined, driver: undefined, acceptedAt: undefined, riderId: "R501", fare: { amountMinor: 1500, currency: "EUR" }, fareLines: [], createdAt: new Date(Date.now() - 60_000).toISOString() };
  await open(page, "/trips/T2005", [{ ...odd }]);
  const line = page.getByTestId("driver-bonus-limit");
  await expect(line).toContainText("€");
  await expect(line).not.toContainText("kr");
});
