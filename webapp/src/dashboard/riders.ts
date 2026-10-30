import { isLiveData, liveTripOf } from "../live/realData.ts";
import type { DemoRecord } from "../api/seed.ts";
import { CATEGORIES } from "../domain/contract.ts";
import { zoneById } from "../markets/markets.ts";
import type { LiveDriver } from "./live.ts";
import type { LatLng } from "./route.ts";
import type { LiveDriverList } from "../live/types.ts";

/** Riders on the live map: waiting for a driver, being picked up or on a trip; riders online from the server. */

export type RideRequest = {
  tripId: string;
  riderId: string | null;
  rider: string;
  zoneId: string;
  zoneName: string;
  at: LatLng;
  category: string;
  categoryLabel: string;
  waitingMin: number;
  status: "searching" | "offered";
  offeredTo: string | null;
};

/** A ride whose driver accepted an admin offer a moment ago: still shown under the waiting riders, apart. */
export type OnTheWay = RideRequest & { driverId: string; driverName: string; acceptedAt: string };

export type Candidate = { driver: LiveDriver; km: number; etaMin: number; categoryOk: boolean };

export type RiderCounts = { online: number; onTrip: number; beingPickedUp: number; waiting: number; longWait: number };

const WAITING = new Set(["requested", "searching", "offered"]);
const LONG_WAIT_MIN = 5;
/** A driver who accepted is "on the way" until the trip leaves these statuses, at most this long after accepting. */
export const ON_THE_WAY_STATUSES: readonly string[] = ["accepted", "driver_to_pickup"];
export const ON_THE_WAY_MAX_MIN = 15;

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function distanceKm(a: LatLng, b: LatLng): number {
  const x = (b[1] - a[1]) * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  const y = b[0] - a[0];
  return Math.sqrt(x * x + y * y) * 111.32 * 1.25;
}

/** `canTake` says whether a driver could really have the ride offered (active and online). */
export function rideRequests(trips: readonly DemoRecord[], riders: readonly DemoRecord[], canTake: (driverId: string) => boolean = () => true): RideRequest[] {
  return trips
    // Older demo requests are long gone; about one in seven is still waiting right now.
    // Live: every trip the server says is waiting; demo: about one in seven old demo requests.
    .filter((trip) => WAITING.has(trip.status) && zoneById(trip.zoneId) && (isLiveData() || (hash(`wait:${trip.id}`) >>> 4) % 7 === 0))
    .map((trip) => requestOf(trip, riders, trip.status === "offered" && trip.driverId && canTake(trip.driverId) ? trip.driverId : null))
    .sort((a, b) => b.waitingMin - a.waitingMin);
}

/** A trip as a rider on the map: where they wait (near the zone centre), their category and how long they waited. */
function requestOf(trip: DemoRecord, riders: readonly DemoRecord[], offeredTo: string | null): RideRequest {
  const zone = zoneById(trip.zoneId)!;
  const facts = liveTripOf(trip);
  if (facts) {
    // Live: the pickup the rider set, the trip's category, and minutes since the server created the trip.
    const category = CATEGORIES.find((item) => item.id === facts.categoryId);
    const created = Date.parse(trip.createdAt ?? facts.updatedAt);
    return {
      tripId: trip.id,
      riderId: trip.tripId ?? null,
      rider: trip.name,
      zoneId: trip.zoneId,
      zoneName: zone.name,
      at: [facts.pickup.lat, facts.pickup.lng] as LatLng,
      category: facts.categoryId,
      categoryLabel: category?.label ?? facts.categoryId,
      waitingMin: Number.isFinite(created) ? Math.max(0, Math.round((Date.now() - created) / 60_000)) : 0,
      status: offeredTo ? "offered" : "searching",
      offeredTo,
    };
  }
  const seed = hash(trip.id);
  const angle = ((seed % 360) * Math.PI) / 180;
  const radius = (zone.kind === "airport" ? 0.004 : 0.012) * (0.3 + ((seed >>> 8) % 70) / 100);
  const category = CATEGORIES[seed % CATEGORIES.length];
  const rider = riders.find((row) => row.phone === trip.phone) ?? null;
  return {
    tripId: trip.id,
    riderId: rider?.id ?? null,
    rider: trip.name,
    zoneId: trip.zoneId,
    zoneName: zone.name,
    at: [zone.center[0] + Math.sin(angle) * radius, zone.center[1] + (Math.cos(angle) * radius) / Math.cos((zone.center[0] * Math.PI) / 180)] as LatLng,
    category: category.id,
    categoryLabel: category.label,
    waitingMin: 1 + (seed % 9),
    status: offeredTo ? "offered" : "searching",
    offeredTo,
  };
}

/**
 * Rides a driver accepted from an admin offer (the assign tool) in the last ON_THE_WAY_MAX_MIN minutes, while the
 * driver is still heading to the pickup: the admin can open them again and see who is on the way. Newest first.
 * They are not waiting any more, so they never count as waiting.
 */
export function onTheWayRequests(trips: readonly DemoRecord[], riders: readonly DemoRecord[], driverName: (driverId: string) => string | undefined, now = Date.now()): OnTheWay[] {
  return trips
    .filter((trip) => ON_THE_WAY_STATUSES.includes(trip.status) && trip.driverId && trip.acceptedAt && zoneById(trip.zoneId))
    .filter((trip) => {
      const age = now - Date.parse(trip.acceptedAt!);
      return Number.isFinite(age) && age >= -60_000 && age <= ON_THE_WAY_MAX_MIN * 60_000;
    })
    .map((trip) => ({ ...requestOf(trip, riders, trip.driverId!), driverId: trip.driverId!, driverName: driverName(trip.driverId!) ?? trip.driverId!, acceptedAt: trip.acceptedAt! }))
    .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
}

/** Free online drivers nearest to a request; those who may drive its category come first. */
export function candidatesFor(request: RideRequest, drivers: readonly LiveDriver[], categoriesOf: (driverId: string) => readonly string[]): Candidate[] {
  return drivers
    .filter((driver) => driver.state === "free")
    .map((driver) => {
      const km = distanceKm([driver.lat, driver.lng], request.at);
      return { driver, km: Math.round(km * 10) / 10, etaMin: Math.max(1, Math.round((km / 24) * 60)), categoryOk: categoriesOf(driver.id).includes(request.category) };
    })
    .sort((a, b) => Number(b.categoryOk) - Number(a.categoryOk) || a.km - b.km);
}

/**
 * Owner G3-R4 (2026-10-30, "Real numbers only"): `serverOnline` is the server's riders online in the zones in view
 * (LiveDriverList.ridersOnline). Without it: riders on a trip, being picked up or waiting. Nothing is invented.
 */
export function riderCounts(requests: readonly RideRequest[], drivers: readonly LiveDriver[], _riders: readonly DemoRecord[], serverOnline: number | null = null): RiderCounts {
  const onTrip = drivers.filter((driver) => driver.state === "trip" || driver.state === "sos").length;
  const beingPickedUp = drivers.filter((driver) => driver.state === "pickup").length;
  return {
    online: serverOnline ?? onTrip + beingPickedUp + requests.length,
    onTrip,
    beingPickedUp,
    waiting: requests.length,
    longWait: requests.filter((request) => request.waitingMin > LONG_WAIT_MIN).length,
  };
}

/** G3-R4: GET /admin/live/drivers → ridersOnline [{ zoneId, count }] as records (one per zone, zones with 0 included). */
export function ridersOnlineRecords(list: Partial<LiveDriverList>): DemoRecord[] {
  return (list.ridersOnline ?? []).map((row) => ({ id: `riders-online-${row.zoneId}`, name: "", phone: "", zoneId: row.zoneId, status: "online", count: row.count }));
}

/** G3-R4: riders online in the zones in view (all rows when none is picked); null when the server sent none. */
export function ridersOnlineIn(rows: readonly DemoRecord[], zones: readonly string[]): number | null {
  if (!rows.length) return null;
  const picked = zones.length ? new Set(zones) : null;
  return rows.filter((row) => !picked || picked.has(row.zoneId)).reduce((sum, row) => sum + (row.count ?? 0), 0);
}
