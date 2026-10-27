import type { DemoRecord } from "../api/seed.ts";
import { isOnline } from "../api/presence.ts";
import { zoneById } from "../markets/markets.ts";
import { along, tripRoute, type TripRoute } from "./route.ts";
import { isLiveData, liveDriverOf } from "../live/realData.ts";

export type LiveState = "free" | "pickup" | "trip" | "stale" | "sos";

export const LIVE_STATES: { id: LiveState; label: string }[] = [
  { id: "free", label: "Free" },
  { id: "pickup", label: "To pickup" },
  { id: "trip", label: "On trip" },
  { id: "stale", label: "No GPS" },
  { id: "sos", label: "SOS" },
];

export type LiveDriver = {
  id: string;
  name: string;
  zoneId: string;
  zoneName: string;
  state: LiveState;
  lat: number;
  lng: number;
  lastSeenMin: number;
  vehicle: string | null;
  plate: string | null;
  tripId: string | null;
  /** Current trip geometry for drivers heading to a pickup or carrying a rider. */
  route: TripRoute | null;
  /** How far along: the approach while heading to the pickup, the trip path once on board. */
  progress: number;
};

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export { isOnline };

const ACTIVE_TRIP = new Set(["accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"]);

/**
 * Online drivers with a simulated position. Only active drivers can be online; each queued SOS
 * flags the first online driver in its zone. `tick` advances moving drivers a little.
 */
export function liveDrivers(
  drivers: readonly DemoRecord[],
  vehicles: readonly DemoRecord[],
  trips: readonly DemoRecord[],
  incidents: readonly DemoRecord[],
  tick: number,
): LiveDriver[] {
  // An SOS sits on the exact driver it belongs to; older records without one fall back to the zone.
  const sos = incidents.filter((row) => row.status === "queued" && row.kind !== "ride_check");
  const sosDrivers = new Set(sos.filter((row) => row.driverId).map((row) => row.driverId!));
  const sosZones = new Set(sos.filter((row) => !row.driverId).map((row) => row.zoneId));
  const flagged = new Set<string>();
  if (isLiveData()) return serverDrivers(drivers, vehicles, trips, sosDrivers);
  return drivers
    .filter((driver) => isOnline(driver) && zoneById(driver.zoneId))
    .map((driver) => {
      const zone = zoneById(driver.zoneId)!;
      const seed = hash(driver.id);
      const roll = seed % 100;
      let state: LiveState = roll < 38 ? "free" : roll < 54 ? "pickup" : roll < 91 ? "trip" : "stale";
      if (sosDrivers.has(driver.id)) state = "sos";
      else if (sosZones.has(driver.zoneId) && !flagged.has(driver.zoneId) && state !== "stale") {
        flagged.add(driver.zoneId);
        state = "sos";
      }
      const spread = zone.kind === "airport" ? 0.006 : 0.014;
      const angle = ((seed % 360) * Math.PI) / 180;
      const radius = spread * (0.25 + ((seed >>> 9) % 100) / 130);
      const moving = state === "pickup" || state === "trip";
      const drift = moving ? tick * 0.035 * (seed % 2 ? 1 : -1) : 0;
      let lat = zone.center[0] + Math.sin(angle + drift) * radius;
      let lng = zone.center[1] + (Math.cos(angle + drift) * radius) / Math.cos((zone.center[0] * Math.PI) / 180);
      const withTrip = state === "pickup" || state === "trip" || state === "sos";
      const route = withTrip ? tripRoute(zone.center, seed, zone.kind === "airport") : null;
      // Drivers advance along their route a little every tick and start over when they arrive.
      const progress = route ? (0.08 + (((seed >>> 11) % 60) / 100) + tick * (state === "pickup" ? 0.012 : 0.006)) % 0.92 : 0;
      if (route) [lat, lng] = along(state === "pickup" ? route.approach : route.path, progress).point;
      const vehicle = vehicles.find((row) => row.driverId === driver.id);
      const trip = state === "trip" || state === "pickup" || state === "sos"
        ? trips.find((row) => row.driverId === driver.id && ACTIVE_TRIP.has(row.status)) ?? trips.find((row) => row.driverId === driver.id)
        : undefined;
      return {
        id: driver.id,
        name: driver.name,
        zoneId: driver.zoneId,
        zoneName: zone.name,
        state,
        lat,
        lng,
        lastSeenMin: state === "stale" ? 6 + (seed % 25) : 0,
        vehicle: vehicle ? `${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() || null : null,
        plate: vehicle?.plate ?? null,
        tripId: trip?.id ?? null,
        route,
        progress,
      };
    });
}

export function countStates(rows: readonly LiveDriver[]): Record<LiveState, number> {
  const counts: Record<LiveState, number> = { free: 0, pickup: 0, trip: 0, stale: 0, sos: 0 };
  for (const row of rows) counts[row.state] += 1;
  return counts;
}

const PICKUP = new Set(["accepted", "driver_to_pickup", "arrived"]);

/**
 * Live build: online drivers where the server last saw them (GET /admin/live/drivers). The state comes from the
 * server (online, on a trip and the trip's status, stale GPS); no driver is moved or placed without a position.
 */
function serverDrivers(drivers: readonly DemoRecord[], vehicles: readonly DemoRecord[], trips: readonly DemoRecord[], sosDrivers: ReadonlySet<string>): LiveDriver[] {
  return drivers.flatMap((driver): LiveDriver[] => {
    const live = liveDriverOf(driver);
    if (!live?.location || !isOnline(driver)) return [];
    const trip = live.activeTripId ? trips.find((row) => row.id === live.activeTripId) : trips.find((row) => row.driverId === driver.id && ACTIVE_TRIP.has(row.status));
    let state: LiveState = live.onlineStatus === "on_trip" ? (trip && PICKUP.has(trip.status) ? "pickup" : "trip") : "free";
    if (live.stale) state = "stale";
    if (sosDrivers.has(driver.id)) state = "sos";
    const vehicle = vehicles.find((row) => row.driverId === driver.id);
    const seen = Date.parse(live.lastFixAt ?? live.location.measuredAt);
    return [{
      id: driver.id,
      name: driver.name,
      zoneId: driver.zoneId,
      zoneName: zoneById(driver.zoneId)?.name ?? driver.zoneId,
      state,
      lat: live.location.lat,
      lng: live.location.lng,
      lastSeenMin: Number.isFinite(seen) ? Math.max(0, Math.round((Date.now() - seen) / 60_000)) : 0,
      vehicle: vehicle ? `${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() || null : null,
      plate: vehicle?.plate ?? null,
      tripId: live.activeTripId ?? trip?.id ?? null,
      route: null,
      progress: 0,
    }];
  });
}
