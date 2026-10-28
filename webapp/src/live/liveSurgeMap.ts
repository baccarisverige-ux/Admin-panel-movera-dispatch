/**
 * Contract v0.7.2 (contract.json#driverSurgeMap): the live Dashboard and Dispatch maps show the server's surge now
 * (GET /admin/surge/now) in the driver map's three colours, light to strong. No multiplier on the map colours.
 *  - low: above 1.0 and below 1.5; medium: 1.5 to 2.5; high: above 2.5. A zone at 1.0 has no colour.
 *  - colours #FFC79E, #FF8A3D, #E5482B; fill about 40 % with a 2 px edge of the same colour.
 * Pure, so node --test covers it.
 */
import type { ZoneSurge } from "../pricing/surge.ts";

export type DriverSurgeLevel = "low" | "medium" | "high";

export const DRIVER_LEVELS: readonly DriverSurgeLevel[] = ["low", "medium", "high"];
export const DRIVER_LEVEL_COLOR: Record<DriverSurgeLevel, string> = { low: "#FFC79E", medium: "#FF8A3D", high: "#E5482B" };
/** The legend's words (no number, like the driver app). */
export const DRIVER_LEVEL_LABEL: Record<DriverSurgeLevel, string> = { low: "Light surge", medium: "Medium surge", high: "Strong surge" };
export const DRIVER_FILL_OPACITY = 0.4;
export const DRIVER_EDGE_PX = 2;

export function driverSurgeLevel(multiplier: number): DriverSurgeLevel | null {
  if (!Number.isFinite(multiplier) || multiplier <= 1) return null;
  if (multiplier < 1.5) return "low";
  if (multiplier <= 2.5) return "medium";
  return "high";
}

/** The zones that get a colour: surge above 1.0 only. */
export function colouredZones(rows: readonly ZoneSurge[]): ZoneSurge[] {
  return rows.filter((row) => driverSurgeLevel(row.multiplier) !== null);
}
