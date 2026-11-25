import { expect, test } from "@playwright/test";
import { DRIVER, FLEET, OWNER, VEHICLE, fakeTripServer, signIn } from "./live-fake";

/**
 * Owner 2026-11-25 "Groupes par flotte (Recommandé)" + mockup "Ok" (Rules PROPOSAL-vehicles-by-fleet-2026-11-25.html):
 * Véhicules shows one group per fleet (biggest first, own cars last) and a Flotte filter.
 */
const PERMS = ["overview.read", "drivers.read", "vehicles.edit", "trips.read", "zones.read", "settings.read"];
const CARS = [
  { ...VEHICLE, vehicleId: "V1", plate: "FLT 001", fleetId: "F1" },
  { ...VEHICLE, vehicleId: "V2", plate: "FLT 002", fleetId: "F1", driverId: null },
  { ...VEHICLE, vehicleId: "V3", plate: "OWN 003", fleetId: null, driverId: null },
];

test("vehicles grouped by fleet, with the Flotte filter", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fakeTripServer(page, { drivers: [{ ...DRIVER }, { ...OWNER }], fleets: [{ ...FLEET }], vehicles: CARS as unknown as (typeof VEHICLE)[], admin: { permissions: PERMS, language: "en" } });
  await signIn(page);
  await page.goto("/vehicles");
  const groups = page.getByTestId("table-group");
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toContainText("Taxi Nord AB");
  await expect(groups.nth(0)).toContainText("2 cars");
  await expect(groups.nth(1)).toContainText("Drivers with their own car");
  await page.getByTestId("vehicle-fleet-filter").selectOption("F1");
  await expect(groups).toHaveCount(1);
  await expect(page.getByRole("cell", { name: "OWN 003" })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "FLT 002" })).toBeVisible();
  expect(errors).toEqual([]);
});
