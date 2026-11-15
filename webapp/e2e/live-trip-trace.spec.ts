import { expect, test, type Page } from "@playwright/test";
import { fakeTripServer, signIn } from "./live-fake";

/**
 * BQ-A08 (owner 2026-10-30 "Road route + driven line (Recommended)", Rules decisions/driver-g11.md:8): the trip page
 * reads GET /admin/trips/{tripId}/trace and draws the driven line next to the planned route; no trace yet and a trace
 * deleted after 30 days say so, and the planned route stays.
 */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS", "access-control-expose-headers": "*" };

async function trace(page: Page, status: number, body: unknown): Promise<string[]> {
  const asked: string[] = [];
  await page.route(/\/api\/v1\/admin\/trips\/T2001\/trace$/, (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    asked.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
  });
  return asked;
}

const FIXES = Array.from({ length: 1200 }, (_, i) => ({ lat: 59.3326 + i * 0.000264, lng: 18.0649 - i * 0.000117, accuracy: 6, measuredAt: new Date(Date.parse("2026-10-25T08:05:00Z") + i * 1500).toISOString() }));

test("A08: an ended trip shows its driven line from GET /admin/trips/{tripId}/trace (a long trace too)", async ({ page }) => {
  await fakeTripServer(page);
  const asked = await trace(page, 200, { tripId: "T2001", fixes: FIXES, keptUntil: "2026-11-24T08:31:00Z" });
  await signIn(page);
  await page.goto("/trips/T2001");
  const state = page.getByTestId("trip-trace-state");
  await expect(state).toHaveAttribute("data-trace", "driven");
  await expect(state).toContainText("Driven route: 1200 GPS positions · kept until");
  await expect(state).toContainText("Driven (GPS)");
  expect(asked[0]).toBe("/api/v1/admin/trips/T2001/trace");
});

test("A08: no trace yet says so and keeps the planned route", async ({ page }) => {
  await fakeTripServer(page);
  await trace(page, 200, { tripId: "T2001", fixes: [], keptUntil: "2026-11-24T08:31:00Z" });
  await signIn(page);
  await page.goto("/trips/T2001");
  await expect(page.getByTestId("trip-trace-state")).toHaveAttribute("data-trace", "empty");
  await expect(page.getByTestId("trip-trace-state")).toContainText("No driven route yet: the driver app has sent no position on this trip. The planned route is shown.");
});

test("A08: a trace deleted after 30 days (404 trace_deleted) says so", async ({ page }) => {
  await fakeTripServer(page);
  await trace(page, 404, { code: "not_found", message: "This trace was deleted after 30 days.", requestId: "r-tr", retryable: false, reason: "trace_deleted" });
  await signIn(page);
  await page.goto("/trips/T2001");
  await expect(page.getByTestId("trip-trace-state")).toHaveAttribute("data-trace", "deleted");
  await expect(page.getByTestId("trip-trace-state")).toContainText("The driven route was deleted 30 days after the trip.");
});
