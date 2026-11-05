/**
 * L-a admin round 1, the "real-only round" (A15 sweep items 3, 6, 7): live, these places show only what the Movera
 * server sends. The demo helpers (driverOps, vehicleOps, driverPerformance) make values up from the id digits; live
 * a value the server did not send is "—" or "Not connected yet", never one of those. Demo behaviour is unchanged.
 */
import type { DemoRecord } from "../api/seed.ts";
import { isLiveData } from "./realData.ts";

type Fuel = NonNullable<DemoRecord["fuel"]>;

/** The car's fuel to show: live only the server's Vehicle.fuel (optional in the contract), else null ("—"). */
export function carFuelShown(record: Pick<DemoRecord, "fuel">, profile: { fuel: Fuel }): Fuel | null {
  if (!isLiveData()) return profile.fuel;
  const fuel = record.fuel;
  return fuel === "petrol" || fuel === "diesel" || fuel === "hybrid" || fuel === "electric" ? fuel : null;
}

/**
 * Whether the driver's linked car fits a category. Live: the server's Vehicle.fitCategories; when the server sent
 * none, null (unknown: the page claims neither "fits" nor "does not fit"). Demo: the page's own check.
 */
export function driverCategoryFits(car: Pick<DemoRecord, "liveFitCategories"> | null, category: string, demoFits: boolean): boolean | null {
  if (!isLiveData()) return car ? demoFits : false;
  if (!car) return false;
  return car.liveFitCategories ? car.liveFitCategories.includes(category) : null;
}

/** The driver page's History lines. Live: the server sends no such history yet (null = "—"). */
export function driverHistoryShown(ops: { activity: readonly string[] }): readonly string[] | null {
  return isLiveData() ? null : ops.activity;
}

/** The Insights "Top drivers" ranking is worked out (demo only: live it has no server source yet). */
export function rankDriversInsights(tab: string): boolean {
  return tab === "insights" && !isLiveData();
}
