import type { RadarZone } from "../dispatch/rules.ts";
import { pointInRing } from "../dispatch/radarZones.ts";
import type { LiveDriver, LiveState } from "./live.ts";
import type { RideRequest } from "./riders.ts";

/** Supply vs demand, one level down: the radar zones of a zone, and the drivers inside a radar zone or a zone. */

export type RadarBalance = { id: string; name: string; ring: [number, number][]; waiting: number; free: number; busy: number; total: number };

export type DriverChip = "free" | "pickup" | "trip" | "off";

/** The status chip of a driver in the drill-down: free, to pickup, on trip, or offline / no GPS. */
export function driverChip(state: LiveState): DriverChip {
  if (state === "free") return "free";
  if (state === "pickup") return "pickup";
  if (state === "trip" || state === "sos") return "trip";
  return "off";
}

const CHIP_ORDER: Record<DriverChip, number> = { free: 0, pickup: 1, trip: 2, off: 3 };

/** Radar zones of a zone with what is inside each right now (riders waiting, free and busy drivers). */
export function radarBalance(zoneId: string, radarZones: readonly RadarZone[], drivers: readonly LiveDriver[], requests: readonly RideRequest[]): RadarBalance[] {
  return radarZones
    .filter((zone) => zone.zoneId === zoneId)
    .map((zone) => {
      const inside = drivers.filter((driver) => pointInRing([driver.lat, driver.lng], zone.ring));
      const waiting = requests.filter((request) => request.status === "searching" && pointInRing(request.at, zone.ring)).length;
      return {
        id: zone.id,
        name: zone.name,
        ring: zone.ring,
        waiting,
        free: inside.filter((driver) => driver.state === "free").length,
        busy: inside.filter((driver) => driver.state === "trip" || driver.state === "pickup").length,
        total: inside.length,
      };
    })
    .sort((a, b) => (b.waiting - b.free) - (a.waiting - a.free) || a.name.localeCompare(b.name));
}

/** Drivers inside a radar zone (by its outline) or a zone (by the zone they are in), free first. */
export function driversIn(where: { ring: readonly [number, number][] } | { zoneId: string }, drivers: readonly LiveDriver[]): LiveDriver[] {
  const inside = "ring" in where
    ? drivers.filter((driver) => pointInRing([driver.lat, driver.lng], where.ring))
    : drivers.filter((driver) => driver.zoneId === where.zoneId);
  return [...inside].sort((a, b) => CHIP_ORDER[driverChip(a.state)] - CHIP_ORDER[driverChip(b.state)] || a.name.localeCompare(b.name));
}

/** What the map should show for a map pin button: a zone (its centre), a radar zone (its outline) or a driver. */
export type MapLocate =
  | { kind: "zone"; zoneId: string; center: [number, number]; nonce: number }
  | { kind: "radar"; ring: [number, number][]; nonce: number }
  | { kind: "driver"; id: string; nonce: number };

/** The [west, south, east, north] box around a [lat, lng] ring. */
export function ringBounds(ring: readonly [number, number][]): [number, number, number, number] | null {
  if (!ring.length) return null;
  const lats = ring.map((point) => point[0]);
  const lngs = ring.map((point) => point[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}
