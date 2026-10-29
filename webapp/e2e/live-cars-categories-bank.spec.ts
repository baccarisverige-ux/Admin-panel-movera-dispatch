import { expect, test, type Page, type Route } from "@playwright/test";
import { API, DRIVER, VEHICLE, fakeTripServer, signIn } from "./live-fake";

/**
 * Contract v0.18.0 (owner 2026-10-29, live admin audit for group 2): Vehicles › Update and Link driver, Drivers ›
 * categories and bank review reach the server; every refusal is explained in the admin's words. SE and FR.
 */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS", "access-control-expose-headers": "*" };
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
const refuse = (route: Route, status: number, code: string, reason: string, details: string[] = []) => json(route, status, { code, message: reason, requestId: "r-x", retryable: false, reason, details });
const modal = (page: Page) => page.locator(".modal.open").last();
async function confirm(page: Page) {
  const reason = modal(page).getByLabel(/^Reason$/);
  if (await reason.count()) {
    if ((await reason.evaluate((el) => el.tagName)) === "SELECT") { if ((await reason.inputValue()) === "") await reason.selectOption({ index: 1 }); }
    else if ((await reason.inputValue()) === "") await reason.fill("Checked with the driver");
  }
  await modal(page).getByRole("button", { name: "Confirm" }).click();
}
const PERMS = ["overview.read", "drivers.read", "drivers.activate", "documents.approve", "vehicles.edit", "trips.read", "zones.read"];
const FR_DRIVER = { ...DRIVER, driverId: "D3001", firstName: "Hugo", lastName: "Petit", country: "FR", cityId: "paris", zoneIds: ["FR-PC"], accountStatus: "active", fleet: undefined, categoryIds: ["economy", "comfort"], documents: [{ documentId: "DB1", type: "bank_statement", status: "in_review" }], version: 3 } as unknown as typeof DRIVER;
const SE_DRIVER = { ...DRIVER, categoryIds: ["economy"], documents: [...DRIVER.documents, { documentId: "DB2", type: "bank_statement", status: "in_review" }] } as unknown as typeof DRIVER;

type Sent = { method: string; path: string; body: Record<string, unknown> | null };
async function fake(page: Page, answer: (path: string, body: Record<string, unknown> | null) => "ok" | ((route: Route) => Promise<void>) = () => "ok") {
  const state = await fakeTripServer(page, { drivers: [{ ...SE_DRIVER }, { ...FR_DRIVER }], vehicles: [{ ...VEHICLE }], admin: { permissions: PERMS } });
  const sent: Sent[] = [];
  await page.route(`${API}/api/v1/admin/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const p = new URL(request.url()).pathname.replace("/api/v1", "");
    const body = (request.postDataJSON?.() ?? null) as Record<string, unknown> | null;
    const ours = /^\/admin\/vehicles\/[^/]+(\/driver)?$|^\/admin\/drivers\/[^/]+\/(categories|bank\/review)$/.test(p) && request.method() !== "GET";
    if (!ours) return route.fallback();
    sent.push({ method: request.method(), path: p, body });
    const custom = answer(p, body);
    if (custom !== "ok") return custom(route);
    const car = /^\/admin\/vehicles\/([^/]+)/.exec(p);
    if (car) {
      const index = state.vehicles.findIndex((item) => item.vehicleId === car[1]);
      const { expectedVersion: _v, driverId, ...rest } = body ?? {};
      void _v;
      state.vehicles[index] = { ...state.vehicles[index]!, ...rest, ...(p.endsWith("/driver") ? { driverId: driverId as string } : {}), version: state.vehicles[index]!.version + 1 };
      return json(route, 200, state.vehicles[index]);
    }
    const who = /^\/admin\/drivers\/([^/]+)/.exec(p)![1];
    const index = state.drivers.findIndex((item) => item.driverId === who);
    if (p.endsWith("/categories")) {
      state.drivers[index] = { ...state.drivers[index]!, categoryIds: body!["categoryIds"] as string[], version: state.drivers[index]!.version + 1 } as typeof DRIVER;
      return json(route, 200, state.drivers[index]);
    }
    return json(route, 200, { documentId: "DB", ownerId: who, type: "bank_statement", status: body!["decision"], version: 2 });
  });
  return { state, sent };
}

test.use({ viewport: { width: 1440, height: 1000 } });

test("SE: Vehicles › Save vehicle compliance sends PATCH; a category the car does not fit is explained", async ({ page }) => {
  let refuseNext = false;
  const f = await fake(page, () => (refuseNext ? (route) => refuse(route, 400, "invalid_request", "category_not_allowed", ["xl:too_few_seats"]) : "ok"));
  await signIn(page);
  await page.goto("/vehicles/V1");
  await page.getByLabel("Year").fill("2021");
  await page.getByLabel("Seats").fill("5");
  await page.getByRole("button", { name: "Save vehicle compliance" }).click();
  await confirm(page);
  await expect.poll(() => f.sent.find((call) => call.method === "PATCH")?.body).toMatchObject({ expectedVersion: 1, year: 2021, seats: 5 });
  expect(f.sent[0]!.path).toBe("/admin/vehicles/V1");
  refuseNext = true;
  await page.getByLabel("Seats").fill("4");
  await page.getByRole("button", { name: "Save vehicle compliance" }).click();
  await confirm(page);
  await expect(page.getByText("The car does not fit that category: xl:too_few_seats.").first()).toBeVisible();
});

test("SE: Link driver sends POST …/driver; a car in use is explained", async ({ page }) => {
  let refuseNext = false;
  const f = await fake(page, (path) => (refuseNext && path.endsWith("/driver") ? (route) => refuse(route, 409, "invalid_transition", "vehicle_in_use") : "ok"));
  await signIn(page);
  await page.goto("/vehicles/V1");
  await page.getByLabel("Linked driver").selectOption({ value: "" });
  await page.getByRole("button", { name: "Save driver assignment" }).click();
  await confirm(page);
  await expect.poll(() => f.sent.find((call) => call.path === "/admin/vehicles/V1/driver")?.body).toEqual({ expectedVersion: 1, driverId: null });
  refuseNext = true;
  await page.getByLabel("Linked driver").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Save driver assignment" }).click();
  await confirm(page);
  await expect(page.getByText("The car is in use by another driver.").first()).toBeVisible();
});

test("FR: driver categories are PUT on the server; the last one cannot be switched off; no car is explained", async ({ page }) => {
  let refuseNext = false;
  const f = await fake(page, () => (refuseNext ? (route) => refuse(route, 409, "invalid_transition", "no_vehicle") : "ok"));
  await signIn(page);
  await page.goto("/drivers/D3001?country=FR");
  await expect(page.getByRole("heading", { level: 2, name: "Hugo Petit" })).toBeVisible();
  await page.getByRole("button", { name: /^Comfort: on, turn off$/ }).click();
  await confirm(page);
  await expect.poll(() => f.sent.find((call) => call.path === "/admin/drivers/D3001/categories")?.body).toEqual({ expectedVersion: 3, categoryIds: ["economy"] });
  await page.reload();
  await page.getByRole("button", { name: /: on, turn off$/ }).first().click();
  await confirm(page);
  await expect(page.getByText("Keep at least one category on.").filter({ visible: true }).first()).toBeVisible();
  expect(f.sent.filter((call) => call.path.endsWith("/categories"))).toHaveLength(1);
  refuseNext = true;
  await page.getByRole("button", { name: /^Comfort: off, turn on$/ }).click();
  await confirm(page);
  await expect(page.getByText("The driver has no car, so no category can be set.").first()).toBeVisible();
});

for (const [country, id, path] of [["SE", "D1001", "/drivers/D1001?tab=earnings"], ["FR", "D3001", "/drivers/D3001?tab=earnings&country=FR"]] as const) {
  test(`${country}: bank review is sent to the server; a rejection without a note is explained`, async ({ page }) => {
    const f = await fake(page, (p, body) => (p.endsWith("/bank/review") && body?.["decision"] === "rejected" && !body["note"] ? (route) => refuse(route, 400, "invalid_request", "note_required") : "ok"));
    await signIn(page);
    await page.goto(path);
    await page.getByRole("button", { name: "Approved", exact: true }).click();
    await confirm(page);
    await expect.poll(() => f.sent.find((call) => call.path === `/admin/drivers/${id}/bank/review`)?.body).toEqual({ decision: "approved" });
    await page.getByRole("button", { name: "Rejected", exact: true }).click();
    await confirm(page);
    await expect(page.getByText("Write a note: the driver sees why the bank details were rejected.").first()).toBeVisible();
  });
}

test("Approve all is gone from the driver page (owner decision 18)", async ({ page }) => {
  await fake(page);
  await signIn(page);
  await page.goto("/drivers/D1001?tab=documents");
  await expect(page.getByRole("heading", { level: 2, name: "Anna Berg" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve all/ })).toHaveCount(0);
});
