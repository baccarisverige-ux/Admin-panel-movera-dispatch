import { expect, test, type Page, type Route } from "@playwright/test";
import { ADMIN, API, SEED_ZONES, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * Live sweep 2026-11-02 (Rules audits/live-sweep-2026-11-02/admin.md):
 * - H1: publishing ONE Dispatch rule (rider raise limit, Södermalm Z002) rewrote unrelated live settings (booking
 *   horizon 14 → 7, cancel reasons replaced, cancel fees added, driver rest minutes 30 → 360…). A publish now starts
 *   from the server's document and changes only what the admin edited.
 * - M1: opening Dispatch › Rules reset the header zone to All zones.
 * - M2: Pricing opened on Arlanda (ARN, closed) and Tips & limits targeted it.
 */

const ADMIN_PLUS = { permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "dispatch.edit", "trips.intervene", "pricing.read", "pricing.edit", "pricing.publish"] };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "access-control-expose-headers": "*" };
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });

const CUSTOM_REASONS = [{ code: "custom_one", title: "Our own reason" }, { code: "custom_two", title: "Another own reason" }];

async function open(page: Page, path: string, { arnClosed = false } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: ADMIN_PLUS, trips: [] as never });
  const settings = await fakeSettings(page);
  // Dispatch tools: nothing saved.
  await page.route(/\/api\/v1\/admin\/dispatch\//, (route) => (route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { items: [] })));
  if (arnClosed) await page.route(`${API}/api/v1/admin/zones`, (route) => (route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { zones: SEED_ZONES().map((zone) => (zone.zoneId === "ARN" ? { ...zone, open: false } : zone)).sort((a, b) => a.zoneId.localeCompare(b.zoneId)) })));
  // Z002's live documents hold values the Dispatch page does not show (and that differ from the admin's defaults).
  const rider = settings.docs.get("rider_app_config:Z002")!;
  const riderDoc = { ...rider.document, booking: { ...(rider.document["booking"] as object), bookingHorizonDays: 14 }, cancelReasons: CUSTOM_REASONS };
  settings.docs.set("rider_app_config:Z002", { ...rider, document: riderDoc, live: riderDoc });
  const driver = settings.docs.get("driver_app_config:Z002")!;
  const driverDoc = { ...driver.document, drivingLimits: { ...(driver.document["drivingLimits"] as object), restMinutes: 30 } };
  settings.docs.set("driver_app_config:Z002", { ...driver, document: driverDoc, live: driverDoc });
  const dispatch = settings.docs.get("dispatch:Z002")!;
  const dispatchDoc = { ...dispatch.document, raisePrice: { maxFactor: 2 } };
  settings.docs.set("dispatch:Z002", { ...dispatch, document: dispatchDoc, live: dispatchDoc });
  await signIn(page, "Dashboard");
  await page.goto(path);
  return { settings, riderDoc, driverDoc, dispatchDoc };
}

const confirm = async (page: Page) => {
  const modal = page.locator(".modal.open").last();
  const reason = modal.getByLabel(/^(Reason|Skäl)$/);
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: /^(Confirm|Bekräfta)$/ }).click();
};

/** The top-level keys whose values differ (stamps left out). */
function differences(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((key) => !["version", "publishedAt", "usesStandard"].includes(key) && JSON.stringify(a[key]) !== JSON.stringify(b[key])).sort();
}

test("H1: publishing the rider raise limit of Södermalm changes only that field; booking horizon, cancel reasons and rest minutes stay the server's", async ({ page }) => {
  const { settings, riderDoc, driverDoc, dispatchDoc } = await open(page, "/dispatch?zone=Z002");
  const raise = page.getByRole("region", { name: "Rider raise limit" });
  await expect(raise.getByLabel("Rider raise limit")).toHaveValue("2");
  await raise.getByLabel("Rider raise limit").fill("2.5");
  await page.getByRole("region", { name: "Publish" }).getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect.poll(() => settings.sent.filter((s) => s.method === "POST").map((s) => s.path)).toContain("/api/v1/admin/config/dispatch/publish");
  await expect(page.getByRole("region", { name: "Publish" })).not.toHaveClass(/has-changes/);

  const dispatchNow = settings.docs.get("dispatch:Z002")!.document;
  expect(differences(dispatchDoc, dispatchNow)).toEqual(["raisePrice"]);
  expect(dispatchNow["raisePrice"]).toEqual({ maxFactor: 2.5 });

  const riderNow = settings.docs.get("rider_app_config:Z002")!.document;
  expect(differences(riderDoc, riderNow)).toEqual([]);
  expect((riderNow["booking"] as { bookingHorizonDays: number }).bookingHorizonDays).toBe(14);
  expect(riderNow["cancelReasons"]).toEqual(CUSTOM_REASONS);

  const driverNow = settings.docs.get("driver_app_config:Z002")!.document;
  expect(differences(driverDoc, driverNow)).toEqual([]);
  expect((driverNow["drivingLimits"] as { restMinutes: number }).restMinutes).toBe(30);
  // No app document was rewritten at all: only the dispatch document was saved.
  expect(settings.sent.filter((s) => s.method === "PUT").map((s) => s.path)).toEqual(["/api/v1/admin/config/dispatch"]);
});

test("M1: Dispatch › Rules keeps the zone chosen at the top and opens its rules", async ({ page }) => {
  await open(page, "/dispatch/map?country=SE&scope=Z002");
  await page.getByTestId("dispatch-tab-rules").click();
  await expect(page).toHaveURL(/scope=Z002/);
  await expect(page.getByRole("region", { name: "Rider raise limit" }).getByLabel("Rider raise limit")).toHaveValue("2");
});

test("M2: Pricing never opens on a closed zone, and Tips & limits for All zones leaves it out", async ({ page }) => {
  const { settings } = await open(page, "/pricing?country=SE", { arnClosed: true });
  await expect(page.locator(".pricing-zone-now strong")).not.toContainText("Arlanda");
  await expect(page.getByRole("navigation", { name: "Zones" }).getByRole("button", { name: /Arlanda/ })).toHaveCount(0);
  expect(settings.sent.some((s) => s.method !== "GET")).toBe(false);
});
