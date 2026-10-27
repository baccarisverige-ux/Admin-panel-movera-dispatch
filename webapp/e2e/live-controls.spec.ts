import { expect, test, type Page, type Route } from "@playwright/test";
import { API, fakeTripServer, signIn } from "./live-fake";

/**
 * Audit phase 5 (admin): the live people area's controls not covered by live-people.spec.ts: repeated clicks send one
 * request, the first-password form, loading/empty/error of the drivers list, sv/fr and 390 px screens.
 */

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-expose-headers": "*" };
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const dialog = (page: Page) => page.locator(".modal.open");

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${where}: no horizontal scroll`).toBeLessThanOrEqual(1);
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
  await expect(page.getByRole("heading", { level: 2, name: "Dashboard" })).toBeVisible();
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
      if (body.setupToken !== "aaaaaaaaaaaaaaaaaaaaaaaa") return json(route, 410, { code: "otp_expired", message: "Expired", requestId: "r-410", retryable: false, reason: "setup_link_expired" });
      return json(route, 200, { email: "new@movera.se", name: "Ny Admin", expiresAt: "2026-10-29T00:00:00Z" });
    }
    sent.push(body);
    await later(500);
    return json(route, 200, { accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 900, actor: "admin", admin: { adminId: "A9", email: "new@movera.se", name: "Ny Admin", role: "super", permissions: ["drivers.read", "trips.read"], scope: { zones: "all" }, idleTimeoutSeconds: 900, approvalExempt: true } });
  });
  await page.goto("/setup-password#token=bbbbbbbbbbbbbbbbbbbbbbbb");
  await expect(page.getByRole("alert")).toContainText("This link is not valid any more.");
  await page.goto("about:blank");
  await page.goto("/setup-password#token=aaaaaaaaaaaaaaaaaaaaaaaa");
  await expect(page.getByText("For Ny Admin (new@movera.se).")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("aaaaaaaaaaaa");
  await page.getByLabel("Repeat the password").fill("bbbbbbbbbbbb");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("alert")).toContainText("The two passwords differ.");
  expect(sent).toHaveLength(0);
  await page.getByLabel("Repeat the password").fill("aaaaaaaaaaaa");
  await page.getByRole("button", { name: "Save password" }).dblclick();
  // This admin has no overview.read: the first menu page they may read opens (Trips).
  await expect(page.getByRole("heading", { level: 2, name: "Trips" })).toBeVisible();
  expect(sent).toEqual([{ setupToken: "aaaaaaaaaaaaaaaaaaaaaaaa", password: "aaaaaaaaaaaa" }]);
  expect(page.url()).not.toContain("token=");
});

test("an admin without overview.read lands on the first menu page they may read after sign-in, not on No access", async ({ page }) => {
  await fakeTripServer(page, { admin: { permissions: ["trips.read"] } });
  await signIn(page, "Trips");
  await expect(page).toHaveURL(/\/trips$/);
  await expect(page.getByText("No access")).toHaveCount(0);
});

test("driver status: a double click on Confirm sends one change", async ({ page }) => {
  const state = await fakeTripServer(page, { statusDelayMs: 500 });
  await signIn(page);
  await page.goto("/drivers/D1000");
  await page.getByRole("button", { name: "Put on hold" }).first().click();
  await dialog(page).getByLabel("Type D1000 to confirm").fill("D1000");
  await dialog(page).getByRole("button", { name: "Confirm" }).dblclick();
  await expect(page.getByText("Driver account is now on hold.")).toBeVisible();
  expect(state.calls.filter((call) => call.method === "POST" && call.path.endsWith("/drivers/D1000/status"))).toHaveLength(1);
});

test("drivers list: a failing server shows the error line and no demo drivers; Try again brings the server's rows", async ({ page }) => {
  const state = await fakeTripServer(page, { driversFail: 503 });
  await signIn(page);
  await page.goto("/drivers");
  const bar = page.getByTestId("live-list-drivers");
  await expect(bar.getByRole("alert")).toContainText("The server is busy.", { timeout: 15_000 });
  await expect(page.getByText(/^0 in All\./)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Anna Berg", exact: true })).toHaveCount(0);
  state.driversFail = undefined;
  await bar.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("cell", { name: "Anna Berg", exact: true }).first()).toBeVisible();
  await expect(bar.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Search this table").fill("nobody");
  await page.getByLabel("Search this table").press("Enter");
  await expect(page.getByText(/^0 in All\./)).toBeVisible();
});

for (const [language, dashboard, fleets, marker] of [
  ["sv", "Kontrollpanel", "Flottägare", "Inte kopplad än"],
  ["fr", "Tableau de bord", "Propriétaires de flotte", "Pas encore connecté"],
] as const) {
  test(`${language}: the live menu, the drivers list and the marker are translated`, async ({ page }) => {
    await fakeTripServer(page, { admin: { language } });
    await signIn(page, dashboard);
    await expect(page.locator("nav").getByRole("link", { name: fleets })).toBeVisible();
    await page.goto("/drivers");
    await expect(page.getByRole("cell", { name: "Anna Berg", exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("not-connected")).toHaveText(marker);
  });
}

test("small screen (390 px): drivers, driver detail, fleets and vehicles without side scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeTripServer(page);
  await signIn(page);
  for (const [path, heading] of [["/drivers", "Drivers"], ["/drivers/D1001", "Anna Berg"], ["/fleets", "Fleet owners"], ["/vehicles", "Vehicles"], ["/onboarding", "Onboarding"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    await noSideScroll(page, path);
  }
});
