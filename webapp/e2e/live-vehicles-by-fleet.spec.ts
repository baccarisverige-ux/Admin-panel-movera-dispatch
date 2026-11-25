import { expect, test } from "@playwright/test";
import { DRIVER, FLEET, OWNER, VEHICLE, fakeTripServer, signIn } from "./live-fake";

/**
 * Owner 2026-11-25 "Groupes par flotte (Recommandé)" + mockup "Ok" (Rules PROPOSAL-vehicles-by-fleet-2026-11-25.html):
 * Véhicules shows one group per fleet (biggest first, own cars last) and a Flotte filter.
 */
const PERMS = ["overview.read", "drivers.read", "vehicles.edit", "trips.read", "zones.read", "settings.read"];
const FLEET2 = { ...FLEET, fleetId: "F2", name: "Alpha Taxi", ownerDriverId: "D2000", ownerName: "Al Pha" };
const CARS = [
  { ...VEHICLE, vehicleId: "V9", plate: "ALP 009", fleetId: "F2", driverId: null },
  { ...VEHICLE, vehicleId: "V1", plate: "FLT 001", fleetId: "F1" },
  { ...VEHICLE, vehicleId: "V2", plate: "FLT 002", fleetId: "F1", driverId: null },
  { ...VEHICLE, vehicleId: "V3", plate: "OWN 003", fleetId: null, driverId: null },
];

test("vehicles grouped by fleet, with the Flotte filter", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fakeTripServer(page, { drivers: [{ ...DRIVER }, { ...OWNER }], fleets: [{ ...FLEET }, { ...FLEET2 }], vehicles: CARS as unknown as (typeof VEHICLE)[], admin: { permissions: PERMS, language: "en" } });
  await signIn(page);
  await page.goto("/vehicles");
  const groups = page.getByTestId("table-group");
  // Biggest fleet first (Taxi Nord AB 2 cars, before Alpha Taxi 1 car), own cars last.
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(0)).toContainText("Taxi Nord AB");
  await expect(groups.nth(0)).toContainText("2 cars · 1 driver");
  await expect(groups.nth(1)).toContainText("Alpha Taxi");
  await expect(groups.nth(1)).toContainText("1 car · 0 drivers");
  await expect(groups.nth(2)).toContainText("Drivers with their own car");
  await expect(groups.nth(0).getByRole("link", { name: "Taxi Nord AB" })).toHaveAttribute("href", "/fleets/D1000");
  await page.getByTestId("vehicle-fleet-filter").selectOption("F1");
  await expect(groups).toHaveCount(1);
  await expect(page.getByRole("cell", { name: "OWN 003" })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "FLT 002" })).toBeVisible();
  expect(errors).toEqual([]);
});
