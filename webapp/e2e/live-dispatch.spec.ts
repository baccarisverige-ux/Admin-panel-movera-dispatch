import { expect, test, type Page, type Route } from "@playwright/test";
import { ACTIVE_TRIP, ADMIN, API, fakeSettings, fakeSurge, fakeTripServer, signIn } from "./live-fake";

/**
 * Owner 2026-10-28 in live: the Dashboard and Dispatch maps show the server's surge now (GET /admin/surge/now) in the
 * driver map's three colours (contract.json#driverSurgeMap), and Dispatch › Live "Pause" and the exclusive offer to a
 * chosen driver go to the server (PUT /admin/zones/{zoneId}/dispatch-control, POST /admin/trips/{tripId}/assign).
 * With SHOTS set, the screens are saved in Swedish at 1440 px.
 */

const SHOTS = process.env.SHOTS;
const DISPATCH_ADMIN = { permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "dispatch.edit", "trips.intervene"] };
const SEARCHING = { ...ACTIVE_TRIP, tripId: "T2003", status: "searching", version: 2, driverId: undefined, driver: undefined, acceptedAt: undefined, riderId: "R501", createdAt: new Date(Date.now() - 4 * 60_000).toISOString() };

type Fake = { control: Record<string, { zoneId: string; paused: boolean; mode: string | null; version: number }>; puts: unknown[]; assigns: unknown[]; pending: boolean };

async function fakeDispatch(page: Page, pending = false): Promise<Fake> {
  const fake: Fake = { control: {}, puts: [], assigns: [], pending };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "access-control-expose-headers": "*" };
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
  await page.route(/\/api\/v1\/admin\/(zones\/[^/]+\/dispatch-control|trips\/[^/]+\/(nearby-drivers|assign))(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    const control = /\/zones\/([^/]+)\/dispatch-control$/.exec(url.pathname);
    if (control) {
      const zoneId = decodeURIComponent(control[1]!);
      const current = fake.control[zoneId] ?? { zoneId, paused: false, mode: null, version: 0 };
      if (request.method() === "GET") return json(route, 200, current);
      const body = request.postDataJSON();
      fake.puts.push({ zoneId, ...body });
      if (body.expectedVersion !== current.version) return json(route, 409, { code: "version_mismatch", message: "Stale version", requestId: "r-409c", retryable: false });
      if (fake.pending) return json(route, 202, { status: "pending_approval", approvalId: "apr_9", action: "dispatch.control", targetId: `dispatch-control:${zoneId}`, requestedAt: new Date().toISOString() });
      fake.control[zoneId] = { zoneId, paused: body.paused, mode: body.mode, version: current.version + 1 };
      return json(route, 200, { ...fake.control[zoneId], by: "A1", at: new Date().toISOString() });
    }
    if (url.pathname.endsWith("/nearby-drivers")) {
      return json(route, 200, { scope: "zone", items: [{ driverId: "D1001", firstName: "Anna", onlineStatus: "online", location: { lat: 59.333, lng: 18.064, measuredAt: new Date().toISOString() }, distanceMeters: 900, pickupEtaSeconds: 180, zoneId: "Z001", categoryIds: ["standard"] }] });
    }
    fake.assigns.push(request.postDataJSON());
    return json(route, 200, { ...SEARCHING, status: "offered", version: 3 });
  });
  return fake;
}

async function open(page: Page, path: string, { language, pending = false }: { language?: string; pending?: boolean } = {}) {
  await fakeTripServer(page, { admin: { ...DISPATCH_ADMIN, ...(language ? { language } : {}) }, trips: [{ ...SEARCHING }] as never });
  await fakeSettings(page);
  const surge = await fakeSurge(page);
  const dispatch = await fakeDispatch(page, pending);
  await signIn(page, language === "sv" ? "Kontrollpanel" : "Dashboard");
  await page.goto(path);
  return { surge, dispatch };
}

test("Dashboard map: the surge layer is the server's surge now in the driver map's three colours, no style picker", async ({ page }) => {
  const { surge } = await open(page, "/?tab=live");
  await page.getByRole("button", { name: "Surge layer" }).click();
  const legend = page.getByTestId("driver-surge-legend");
  await expect(legend).toContainText("Light surge");
  await expect(legend).toContainText("Strong surge");
  await expect(legend).not.toContainText("×");
  await expect(page.getByRole("radiogroup", { name: "Surge map style" })).toHaveCount(0);
  await expect(page.locator(".surge-pill")).toHaveCount(0);
  expect(surge.calls.some((call) => call.path.startsWith("/api/v1/admin/surge/now"))).toBe(true);
});

test("Dispatch: Pause asks for a reason and puts the zone's switch on the server; Resume puts it back", async ({ page }) => {
  const { dispatch } = await open(page, "/dispatch?view=live");
  await page.getByRole("button", { name: "Pause Stockholm County" }).click();
  const dialog = page.locator(".modal.open");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Confirm/ }).click();
  await expect.poll(() => dispatch.puts.length).toBe(1);
  expect(dispatch.puts[0]).toMatchObject({ zoneId: "Z001", expectedVersion: 0, paused: true, mode: null });
  await expect(page.getByRole("button", { name: "Resume Stockholm County" })).toBeVisible();
  await page.getByRole("button", { name: "Resume Stockholm County" }).click();
  await page.locator(".modal.open").getByRole("button", { name: /Confirm/ }).click();
  await expect.poll(() => dispatch.puts.length).toBe(2);
  expect(dispatch.puts[1]).toMatchObject({ zoneId: "Z001", expectedVersion: 1, paused: false, mode: null });
});

test("Dispatch: a server that files an approval (202) says it waits for a second admin", async ({ page }) => {
  const { dispatch } = await open(page, "/dispatch?view=live", { pending: true });
  await page.getByRole("button", { name: "Pause Stockholm County" }).click();
  await page.locator(".modal.open").getByRole("button", { name: /Confirm/ }).click();
  await expect.poll(() => dispatch.puts.length).toBe(1);
  await expect(page.getByText("waiting for a second admin to approve").first()).toBeVisible();
});

test("Dispatch: an exclusive offer to a chosen driver goes to POST /admin/trips/{tripId}/assign with the trip's version", async ({ page }) => {
  const { dispatch } = await open(page, "/dispatch?view=live");
  await page.getByRole("button", { name: /^Nearby drivers for / }).first().click();
  const panel = page.getByTestId("assign-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: /^Assign Anna/ }).click();
  const dialog = page.locator(".modal.open");
  await expect(dialog).toContainText("Send an exclusive offer");
  await dialog.getByRole("button", { name: /Confirm/ }).click();
  await expect.poll(() => dispatch.assigns.length).toBe(1);
  expect(dispatch.assigns[0]).toMatchObject({ expectedVersion: 2, driverId: "D1001" });
});

test("live screenshots in Swedish (SHOTS)", async ({ page }) => {
  test.skip(!SHOTS, "screenshots only");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/?tab=live", { language: "sv" });
  await page.getByRole("button", { name: "Rusningslager" }).click().catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/live-dashboard-map-sv-1440.png`, fullPage: true });
  await page.goto("/dispatch?view=live");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/live-dispatch-sv-1440.png`, fullPage: true });
  await page.getByRole("button", { name: "Pause Stockholm County" }).click();
  await expect(page.locator(".modal.open")).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/live-dispatch-pause-confirm-sv-1440.png` });
  await page.reload();
  await page.locator('[aria-label^="Förare nära"], [aria-label^="Nearby drivers for"]').first().click();
  await page.getByTestId("assign-panel").locator(".as-driver-name").first().click();
  await expect(page.locator(".modal.open")).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/live-dispatch-force-dialog-sv-1440.png` });
  await page.goto("/vehicles");
  await page.goto("/dispatch?zone=Z001&tab=rides");
  await expect(page.getByText("Movera XL").first()).toBeVisible();
  await page.getByText("Movera XL").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/movera-xl-sv-1440.png` });
});
