import { expect, test } from "@playwright/test";
import { ACTIVE_TRIP, DRIVER, fakeTripServer, signIn } from "./live-fake";

/**
 * Step 39 (2026-11-09, plan 0.28a, Rules audit A15 N5 and N7): the Dashboard's "ride requests" number comes from the
 * server (every waiting trip, GET /admin/trips?status=requested&status=searching&status=offered, all pages), not from
 * the first 50 trips the panel loaded; and a driver beyond the loaded pages opens by id (GET /admin/drivers/{driverId}).
 * Before: 120 waiting trips showed as 50 ("Riders waiting 50"), and /drivers/D1120 said "not found".
 */
const SHOT = process.env.SHOT_DIR;
const WAITING = 120;
const waitingTrips = Array.from({ length: WAITING }, (_, index) => ({
  ...ACTIVE_TRIP,
  tripId: `T3${String(index + 1).padStart(3, "0")}`,
  status: "searching",
  driverId: null,
  vehicleId: null,
  driver: undefined,
  acceptedAt: undefined,
  createdAt: new Date(Date.UTC(2026, 9, 25, 8, 0, index)).toISOString(),
}));
const drivers = Array.from({ length: 120 }, (_, index) => ({ ...DRIVER, driverId: `D1${String(index + 1).padStart(3, "0")}`, firstName: `Driver${index + 1}`, lastName: "Paged" }));

test("the Dashboard counts every waiting ride request from the server, not the first page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await fakeTripServer(page, { trips: waitingTrips, pagedLists: true });
  await signIn(page);
  await page.goto("/?tab=live");
  const chip = page.getByRole("button", { name: /Riders waiting/ });
  await expect(chip).toBeVisible();
  if (SHOT) await page.screenshot({ path: `${SHOT}/dashboard-live-tab.png`, fullPage: false });
  await expect(chip).toContainText(String(WAITING));
  await expect(page.getByText(`${WAITING} Looking for a driver`)).toBeVisible();
  // The server was asked for the waiting trips only (every page), never a count made up in the panel.
  const listed = state.calls.filter((call) => call.method === "GET" && call.path.startsWith("/api/v1/admin/trips?") && call.path.includes("status=searching"));
  expect(listed.length).toBeGreaterThanOrEqual(2);
});

test("a driver beyond the first page opens by id", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await fakeTripServer(page, { drivers, pagedLists: true });
  await signIn(page);
  await page.goto("/drivers/D1120");
  await expect(page.getByRole("heading", { level: 2, name: /Driver120 Paged/ })).toBeVisible();
  await expect(page.getByText("not found", { exact: false })).toHaveCount(0);
  expect(state.calls.some((call) => call.method === "GET" && call.path === "/api/v1/admin/drivers/D1120")).toBe(true);
});
