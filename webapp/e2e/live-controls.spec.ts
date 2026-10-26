import { expect, test, type Page, type Route } from "@playwright/test";
import { API, fakeTripServer, signIn } from "./live-fake";

/**
 * Audit phase 5 (admin): the live people area's controls not covered by live-people.spec.ts: repeated clicks send one
 * request, the first-password form, loading/empty/error of the drivers list, sv/fr and 390 px screens.
 */

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-expose-headers": "*" };
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DRIVER = { driverId: "D1001", accountStatus: "on_hold", onlineStatus: "offline", firstName: "Anna", lastName: "Berg", accountType: "driver", country: "SE", cityId: "stockholm_lan", zoneIds: ["Z001"], categoryIds: ["standard"], documents: [], requiredDocuments: ["terms"], version: 2 };

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${where}: no horizontal scroll`).toBeLessThanOrEqual(1);
}

/** Drivers, a fleet and a vehicle on top of the trips fake (a later page.route wins). */
async function people(page: Page, options: { driversFail?: boolean; driversDelayMs?: number; statusDelayMs?: number } = {}) {
  const posts: string[] = [];
  let driver = { ...DRIVER };
  await page.route(`${API}/api/v1/admin/drivers**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/admin/drivers") {
      if (options.driversDelayMs) await later(options.driversDelayMs);
      if (options.driversFail) return json(route, 503, { code: "unavailable", message: "The server is busy.", requestId: "r-503", retryable: true });
      const q = url.searchParams.get("q");
      return json(route, 200, { items: q === "nobody" ? [] : [driver], nextCursor: null });
    }
    if (url.pathname === "/api/v1/admin/drivers/D1001") return json(route, 200, driver);
    if (url.pathname === "/api/v1/admin/drivers/D1001/status") {
      posts.push(url.pathname);
      if (options.statusDelayMs) await later(options.statusDelayMs);
      driver = { ...driver, accountStatus: request.postDataJSON().accountStatus, version: driver.version + 1 };
      return json(route, 200, driver);
    }
    return json(route, 404, { code: "not_found", message: "No route", requestId: "r", retryable: false });
  });
  await page.route(`${API}/api/v1/admin/fleets**`, (route) => (route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { items: [], nextCursor: null })));
  await page.route(`${API}/api/v1/admin/vehicles**`, (route) => (route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: CORS }) : json(route, 200, { items: [], nextCursor: null })));
  return { posts, set: (next: Partial<typeof DRIVER>) => (driver = { ...driver, ...next }) };
}

test("sign-in: empty fields send nothing; a double click sends one sign-in", async ({ page }) => {
  const state = await fakeTripServer(page);
  await page.route(`${API}/api/v1/admin/auth/sign-in`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    await later(500);
    return route.fallback();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  expect(state.calls.filter((call) => call.path.endsWith("/sign-in"))).toHaveLength(0);
  await page.getByLabel("Email").fill("owner@movera.se");
  await page.getByLabel("Password").fill("correct-horse");
  await page.getByRole("button", { name: "Sign in" }).dblclick();
  await expect(page.getByRole("heading", { level: 2, name: "Drivers" })).toBeVisible();
  expect(state.calls.filter((call) => call.path.endsWith("/sign-in"))).toHaveLength(1);
});

test("first password: different passwords are refused; a double click sends one request; a bad link says so", async ({ page }) => {
  const sent: unknown[] = [];
  await fakeTripServer(page);
  await page.route(`${API}/api/v1/admin/auth/setup-password**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = request.postDataJSON();
    if (request.url().endsWith("/check")) {
      if (body.setupToken !== "fixture-link-good") return json(route, 410, { code: "otp_expired", message: "Expired", requestId: "r-410", retryable: false, reason: "setup_link_expired" });
      return json(route, 200, { email: "new@movera.se", name: "Ny Admin", expiresAt: "2026-10-29T00:00:00Z" });
    }
    sent.push(body);
    await later(500);
    return json(route, 200, { accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 900, actor: "admin", admin: { adminId: "A9", email: "new@movera.se", name: "Ny Admin", role: "super", permissions: ["drivers.read", "trips.read"], scope: { zones: "all" }, idleTimeoutSeconds: 900, approvalExempt: true } });
  });
  await page.goto("/setup-password#token=fixture-link-old");
  await expect(page.getByRole("alert")).toContainText("This link is not valid any more.");
  await page.goto("about:blank");
  await page.goto("/setup-password#token=fixture-link-good");
  await expect(page.getByText("For Ny Admin (new@movera.se).")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("pw-fixture-one");
  await page.getByLabel("Repeat the password").fill("pw-fixture-two");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("alert")).toContainText("The two passwords differ.");
  expect(sent).toHaveLength(0);
  await page.getByLabel("Repeat the password").fill("pw-fixture-one");
  await page.getByRole("button", { name: "Save password" }).dblclick();
  await expect(page.getByRole("heading", { level: 2, name: "Drivers" })).toBeVisible();
  expect(sent).toEqual([{ setupToken: "fixture-link-good", password: "pw-fixture-one" }]);
  expect(page.url()).not.toContain("token=");
});

test("an admin without overview.read lands on a live page after sign-in, not on No access", async ({ page }) => {
  await fakeTripServer(page, { admin: { permissions: ["trips.read"] } });
  await signIn(page, "Trips");
  await expect(page).toHaveURL(/\/trips$/);
  await expect(page.getByText("No access")).toHaveCount(0);
});

test("driver status: a double click on Confirm sends one change", async ({ page }) => {
  await fakeTripServer(page, { admin: { permissions: ["drivers.read", "drivers.activate", "trips.read"] } });
  const fake = await people(page, { statusDelayMs: 500 });
  await signIn(page);
  await page.goto("/drivers/D1001");
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Activate driver" });
  await dialog.getByLabel("Note (required)").fill("Checked");
  await dialog.getByRole("button", { name: "Activate" }).dblclick();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".page-heading")).toContainText("Active");
  expect(fake.posts).toHaveLength(1);
});

test("drivers list: loading, error with retry, empty search", async ({ page }) => {
  await fakeTripServer(page);
  await people(page, { driversFail: true, driversDelayMs: 800 });
  await page.goto("/");
  await page.getByLabel("Email").fill("owner@movera.se");
  await page.getByLabel("Password").fill("correct-horse");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Loading.")).toBeVisible();
  // A retryable 503 is tried 3 times (queryRetry) before the error shows.
  await expect(page.getByRole("alert")).toContainText("The server is busy.", { timeout: 15_000 });
  await page.unroute(`${API}/api/v1/admin/drivers**`);
  await people(page);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator("tr[data-driver-id]")).toHaveCount(1);
  await page.getByLabel("Search by name, e-mail or id").fill("nobody");
  await page.locator(".live-search").getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("No drivers match.")).toBeVisible();
});

for (const [language, drivers, fleets, search] of [
  ["sv", "Förare", "Flottägare", "Sök"],
  ["fr", "Chauffeurs", "Propriétaires de flotte", "Rechercher"],
] as const) {
  test(`${language}: the live menu and the drivers list are translated`, async ({ page }) => {
    await fakeTripServer(page, { admin: { language } });
    await people(page);
    await signIn(page, drivers);
    await expect(page.locator("nav").getByRole("link", { name: fleets })).toBeVisible();
    await expect(page.locator(".live-search").getByRole("button", { name: search })).toBeVisible();
    await expect(page.locator("tr[data-driver-id]")).toHaveCount(1);
  });
}

test("small screen (390 px): drivers, driver detail, fleets and vehicles without side scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeTripServer(page);
  await people(page);
  await signIn(page);
  await expect(page.locator("tr[data-driver-id]")).toHaveCount(1);
  await noSideScroll(page, "/drivers");
  for (const [path, heading] of [["/drivers/D1001", "Anna Berg"], ["/fleets", "Fleet owners"], ["/vehicles", "Vehicles"], ["/onboarding", "Onboarding"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    await noSideScroll(page, path);
  }
});
