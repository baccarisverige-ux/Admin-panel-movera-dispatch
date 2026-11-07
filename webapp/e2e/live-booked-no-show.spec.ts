import { expect, test } from "@playwright/test";
import { ACTIVE_TRIP, ADMIN, fakeTripServer, signIn } from "./live-fake";

// Supervisor S7 R4: the server refuses a booked ride's no-show before pickup time + the no-show wait (409 no_show_too_early).
const BOOKED = { ...ACTIVE_TRIP, tripId: "T3001", kind: "scheduled", status: "accepted", version: 5, scheduledAt: "2099-01-01T08:00:00Z", reservation: { mode: "list", dispatchAt: "2099-01-01T07:40:00Z", freeChangeUntil: "2099-01-01T07:00:00Z", noDriver: false }, driverLocation: { lat: 59.3345, lng: 18.0632, accuracy: 6, measuredAt: "2026-10-26T09:20:40Z" } };

test("S7 R4: a booked ride due in 2099 offers no Mark no-show on the trip page or in Reservations", async ({ page }) => {
  await fakeTripServer(page, { trips: [{ ...BOOKED }], admin: { permissions: [...ADMIN.permissions, "trips.intervene"] } });
  await signIn(page);
  await page.goto("/trips/T3001");
  await expect(page.getByTestId("noshow-block")).toContainText("A booked ride can be marked a no-show only after its pickup time and the waiting time.");
  await expect(page.locator('button[data-command="admin.trip.noShow"]')).toBeDisabled();
  await page.goto("/reservations");
  const row = page.getByTestId("resv-T3001");
  await expect(row).toContainText("Driver holds it");
  await expect(row.getByRole("button", { name: "Take the driver off" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Mark no-show" })).toHaveCount(0);
});
