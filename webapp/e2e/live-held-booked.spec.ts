import { expect, test } from "@playwright/test";
import { ACTIVE_TRIP, fakeTripServer, signIn } from "./live-fake";

// Supervisor S7 (M1 + T1): a booked ride a driver holds for 2099 is not a running trip on Trips or the Live map.
const BOOKED = { ...ACTIVE_TRIP, tripId: "T3001", kind: "scheduled", status: "accepted", version: 5, scheduledAt: "2099-01-01T08:00:00Z", reservation: { mode: "list", dispatchAt: "2099-01-01T07:40:00Z", freeChangeUntil: "2099-01-01T07:00:00Z", noDriver: false }, driverLocation: { lat: 59.3345, lng: 18.0632, accuracy: 6, measuredAt: "2026-10-26T09:20:40Z" } };

test("S7 M1/T1: a held booked ride is not On the road, has no ETA cell and is not an active trip on the Live map", async ({ page }) => {
  await fakeTripServer(page, { trips: [{ ...BOOKED }], noLiveDrivers: true });
  await signIn(page);
  await page.goto("/trips");
  await expect(page.getByRole("cell", { name: "T3001", exact: true })).toBeVisible();
  await expect(page.getByTestId("trip-live-T3001")).toHaveCount(0);
  await page.goto("/trips?group=live");
  await expect(page.getByRole("heading", { level: 2, name: "Trips" })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("cell", { name: "T3001", exact: true })).toHaveCount(0);
  await page.goto("/live");
  await expect(page.getByTestId("live-tick")).toContainText("Trips on the map 0 of 0 active.");
});
