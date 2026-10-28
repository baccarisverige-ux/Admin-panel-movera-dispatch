import type { DemoRecord, TripRecord } from "../api/seed.ts";
import { ZONES } from "../api/seed.ts";
import { CATEGORIES, RIDER_ONBOARD_STATUSES, TRIP_STATUSES, ratingAllowed, type TripStatus } from "../domain/contract.ts";
import { statusLabel } from "../domain/labels.ts";
import { formatMoney } from "../domain/money.ts";
import { market, marketOfZone } from "../markets/markets.ts";
import { canAdjustFare, canComplete, canNoShow, canOffer, canReassign, canRefundTrip, canSetWaiting, cancelTrip, eligibleDrivers, type OfferDriver, type Trip } from "./rules.ts";
import { STEP_MS, startedAt, tripIndex } from "./clock.ts";
import { tr, uiLocale } from "../i18n/core.ts";
import { NOT_CONNECTED_TEXT, isLiveData, liveDriverOf, liveRiderIdOf, liveTripOf } from "../live/realData.ts";
import type { LivePlace } from "../api/seed.ts";

export { startedAt, tripIndex };

export const PAYMENT_STATES = ["pending", "authorized", "captured", "failed", "refunded"] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

const STREETS = [
  "Drottninggatan 12",
  "Sveavägen 44",
  "Götgatan 18",
  "Strandvägen 7",
  "Hantverkargatan 22",
  "Odengatan 51",
  "Karlaplan 3",
  "Kungsgatan 8",
  "Birger Jarlsgatan 15",
  "Hornsgatan 80",
];

const ZONE_CENTER: Record<string, [number, number]> = {
  Z001: [59.334, 18.063],
  Z002: [59.314, 18.07],
  Z003: [59.338, 18.088],
  Z004: [59.33, 18.03],
  Z005: [59.346, 18.048],
  Z006: [59.34, 17.94],
  Z007: [59.36, 18.0],
  Z008: [59.403, 17.944],
  Z009: [59.195, 17.628],
  ARN: [59.649, 17.929],
  BMA: [59.354, 17.948],
};

export const MAP_BOUNDS = { north: 59.42, south: 59.29, west: 17.9, east: 18.15 };

export function zoneName(zoneId: string): string {
  return ZONES.find(([id]) => id === zoneId)?.[1] ?? zoneId;
}

export type CategoryInfo = { id: string; label: string; seats: number | null };

export function categoryOf(id: string): CategoryInfo {
  // Live build: the trip's own category from the server (seats unknown for a category the panel does not know).
  const live = liveTripOf({ id });
  if (live) return CATEGORIES.find((item) => item.id === live.categoryId) ?? { id: live.categoryId, label: live.categoryId, seats: null };
  return CATEGORIES[tripIndex(id) % CATEGORIES.length];
}

export function paymentOf(trip: DemoRecord): PaymentState {
  const kind = trip.kind ?? "";
  if ((PAYMENT_STATES as readonly string[]).includes(kind)) return kind as PaymentState;
  // Live: no payment state from the server yet means none was made.
  if (liveTripOf(trip) || isLiveData()) return "pending";
  return PAYMENT_STATES[tripIndex(trip.id) % PAYMENT_STATES.length];
}

export function stockholmDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** A time shown in the trip zone's own time zone and date style (Stockholm, Paris or Tunis). */
export function zoneTimeLabel(iso: string, zoneId: string): string {
  const place = marketOfZone(zoneId) ?? market("SE");
  return new Intl.DateTimeFormat(uiLocale(), { timeZone: place.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export type StopPoint = { label: string; lat: number; lng: number; kind: "pickup" | "stop" | "dropoff" };

/** A server place as a line: its address, else its coordinates. */
export function placeText(place: LivePlace): string {
  return place.address?.trim() || `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
}

export function stopsOf(trip: DemoRecord): StopPoint[] {
  const live = liveTripOf(trip);
  if (live) {
    return [
      { label: placeText(live.pickup), lat: live.pickup.lat, lng: live.pickup.lng, kind: "pickup" },
      ...live.stops.map((stop): StopPoint => ({ label: placeText(stop), lat: stop.lat, lng: stop.lng, kind: "stop" })),
      { label: placeText(live.dropoff), lat: live.dropoff.lat, lng: live.dropoff.lng, kind: "dropoff" },
    ];
  }
  const index = tripIndex(trip.id);
  const [lat, lng] = ZONE_CENTER[trip.zoneId] ?? [59.33, 18.06];
  const extra = index % 4;
  const pickup: StopPoint = { label: `${STREETS[index % STREETS.length]}, ${zoneName(trip.zoneId)}`, lat, lng, kind: "pickup" };
  const mids: StopPoint[] = Array.from({ length: extra }, (_, step) => ({
    label: STREETS[(index + step + 1) % STREETS.length],
    lat: lat - 0.004 * (step + 1),
    lng: lng + 0.004 * (step + 1),
    kind: "stop",
  }));
  const dropoff: StopPoint = {
    label: `${STREETS[(index + 5) % STREETS.length]}, Stockholm`,
    lat: lat - 0.012,
    lng: lng + 0.01,
    kind: "dropoff",
  };
  return [pickup, ...mids, dropoff];
}

const ACTIVE_FLOW = TRIP_STATUSES.slice(0, TRIP_STATUSES.indexOf("completed") + 1);

function terminalBaseStatus(trip: DemoRecord): TripStatus {
  if (trip.previousStatus && ACTIVE_FLOW.includes(trip.previousStatus as TripStatus)) return trip.previousStatus as TripStatus;
  if (trip.status === "cancelled_by_rider") return "searching";
  if (trip.status === "cancelled_by_driver") return "accepted";
  if (trip.status === "cancelled_by_admin") return "arrived";
  if (trip.status === "cancelled_by_system") return "requested";
  if (trip.status === "no_show") return "arrived";
  if (trip.status === "expired") return "searching";
  if (trip.status === "failed") return "in_trip";
  return "draft";
}

export function timelineOf(trip: DemoRecord): { at: string; label: string; code: string }[] {
  // Live: only the times the server sent (created, accepted, the last change), never steps 90 s apart.
  const live = liveTripOf(trip);
  if (live) {
    const steps: { at: string; label: string; code: string }[] = [];
    if (trip.createdAt) steps.push({ code: "requested", label: statusLabel("requested"), at: trip.createdAt });
    if (trip.acceptedAt) steps.push({ code: "accepted", label: statusLabel("accepted"), at: trip.acceptedAt });
    if (!steps.some((step) => step.code === trip.status)) steps.push({ code: trip.status, label: statusLabel(trip.status), at: live.updatedAt });
    return steps;
  }
  const start = Date.parse(startedAt(trip.id));
  let codes: readonly TripStatus[];
  if (ACTIVE_FLOW.includes(trip.status as TripStatus)) {
    codes = ACTIVE_FLOW.slice(0, ACTIVE_FLOW.indexOf(trip.status as TripStatus) + 1);
  } else {
    const base = terminalBaseStatus(trip);
    const prefix = ACTIVE_FLOW.slice(0, Math.max(0, ACTIVE_FLOW.indexOf(base)) + 1);
    codes = [...prefix, trip.status as TripStatus];
  }
  return codes.map((code, step) => ({
    code,
    label: statusLabel(code),
    at: new Date(start + step * STEP_MS).toISOString(),
  }));
}

export function fareBreakdown(trip: DemoRecord) {
  const live = liveTripOf(trip);
  if (live) {
    // Live: the trip's own fare lines; distance, minutes and rates are not on the trip (shown as not connected).
    return { pickupOre: NaN, km: NaN, perKmOre: NaN, minutes: NaN, perMinOre: NaN, waitingMin: trip.waitingMin ?? NaN, waitingOre: NaN, minimumOre: NaN, appliedMin: false, ruleVersion: NOT_CONNECTED_TEXT, chargedOre: live.fare, lines: live.fareLines, live: true as const };
  }
  const index = tripIndex(trip.id);
  const pickupOre = 3900 + (index % 5) * 100;
  const km = 2 + (index % 18);
  const perKmOre = 1500;
  const minutes = 8 + (index % 25);
  const perMinOre = 650;
  const waitingMin = trip.waitingMin ?? (index % 6);
  const waitingOre = waitingMin * perMinOre;
  const summed = pickupOre + km * perKmOre + minutes * perMinOre + waitingOre;
  const minimumOre = 8900;
  return {
    pickupOre,
    km,
    perKmOre,
    minutes,
    perMinOre,
    waitingMin,
    waitingOre,
    minimumOre,
    appliedMin: summed < minimumOre,
    ruleVersion: `price-${trip.zoneId}-v${(index % 3) + 1}`,
    chargedOre: trip.fareOre ?? Math.max(summed, minimumOre),
    lines: [] as { code: string; amountMinor: number }[],
    live: false as const,
  };
}

export function pinVerified(id: string): string {
  if (liveTripOf({ id }) || isLiveData()) return tr(NOT_CONNECTED_TEXT);
  return tripIndex(id) % 2 === 0 ? "Yes" : "No";
}

/**
 * contract.json#ratingAllowed: the rider rates a completed trip and one they ended early. A rider leaves an on-board
 * status for cancelled_by_rider only through `end_early`, so that is how an ended-early trip shows here.
 */
export function ratingLabel(trip: DemoRecord): string {
  const endedEarly = trip.status === "cancelled_by_rider" && (RIDER_ONBOARD_STATUSES as readonly string[]).includes(trip.previousStatus ?? "");
  if (!ratingAllowed("rider", trip.status, endedEarly ? "end_early" : undefined)) return tr("Not rated yet");
  const live = liveTripOf(trip);
  if (live) return live.ratingStatus === "rated" ? `${tr("Rated")} · ${tr("Stars")}: ${tr(NOT_CONNECTED_TEXT)}` : live.ratingStatus === "skipped" ? tr("Skipped") : tr("Not rated yet");
  if (isLiveData()) return tr(NOT_CONNECTED_TEXT);
  return `${3 + (tripIndex(trip.id) % 3)} of 5`;
}

export function cancelledBy(status: string): string {
  if (status === "cancelled_by_rider") return "Rider";
  if (status === "cancelled_by_driver") return "Driver";
  if (status === "cancelled_by_admin") return "Admin";
  if (status === "cancelled_by_system") return "System";
  if (status === "no_show") return "No-show";
  return tr("Not cancelled");
}

export function cancelReason(trip: DemoRecord): string {
  if (trip.notes) return trip.notes;
  if (trip.status.startsWith("cancelled") || trip.status === "no_show") {
    if (liveTripOf(trip) || isLiveData()) return (trip as TripRecord).cancelReasonCode ?? tr(NOT_CONNECTED_TEXT);
    return ["Rider changed plans", "Could not reach the pickup", "Safety review", "Rider did not arrive"][tripIndex(trip.id) % 4];
  }
  return tr("Not cancelled");
}

export function riderIdFor(trip: DemoRecord): string {
  const live = trip.liveTrip ? trip.tripId ?? null : liveRiderIdOf(trip.id);
  if (live) return live;
  return `R${String((tripIndex(trip.id) % 250) + 1).padStart(4, "0")}`;
}

export function asTrip(trip: DemoRecord | TripRecord): Trip {
  return {
    id: trip.id,
    status: trip.status as TripStatus,
    category: categoryOf(trip.id).id as Trip["category"],
    fareOre: trip.fareOre ?? 0,
    ruleVersion: fareBreakdown(trip).ruleVersion,
    driverId: trip.driverId ?? null,
  };
}

export function cancelBlock(status: string): string | null {
  const error = cancelTrip({ id: "x", status: status as TripStatus, category: "economy", fareOre: 1, ruleVersion: "v", driverId: null }, "check").error;
  return error && error !== "A reason is required." ? error : null;
}

export function offerBlock(status: string): string | null {
  return canOffer(status) ? null : tr("Offer is only available while the trip is requested, searching or offered. The driver still has to accept.");
}

export function reassignBlock(status: string): string | null {
  return canReassign(status) ? null : tr("Reassign is only available from an offer until the driver has arrived, before the rider is in the car.");
}

export function noShowBlock(status: string): string | null {
  return canNoShow(status) ? null : tr("No-show is only available once a driver has accepted and before the rider is in the car.");
}

export function completeBlock(status: string): string | null {
  return canComplete(status) ? null : tr("Complete is only available once the rider is in the car.");
}

export function adjustBlock(status: string): string | null {
  return canAdjustFare(status)
    ? null
    : tr("Fare adjustment is not allowed while the trip is {0}.", [statusLabel(status).toLowerCase()]);
}

export function waitingBlock(status: string): string | null {
  return canSetWaiting(status)
    ? null
    : tr("Waiting time cannot be changed while the trip is {0}.", [statusLabel(status).toLowerCase()]);
}

export function refundBlock(payment: PaymentState, status = "completed"): string | null {
  if (!canRefundTrip(status)) return tr("Refund is only available after the trip reaches a refundable terminal state.");
  if (payment === "refunded") return tr("This payment is already refunded.");
  if (payment !== "captured") return tr("Refund is only available after the payment is captured.");
  return null;
}

export function waybill(trip: DemoRecord, driverName: string, plate: string, vehicleName = "") {
  const live = liveTripOf(trip);
  const stops = stopsOf(trip);
  const category = categoryOf(trip.id);
  return {
    tripId: trip.id,
    status: statusLabel(trip.status),
    issuedAt: zoneTimeLabel(startedAt(trip.id), trip.zoneId),
    fare: formatMoney({ amountMinor: fareBreakdown(trip).chargedOre, currency: (marketOfZone(trip.zoneId) ?? market("SE")).currency }),
    service: category.label,
    riderName: trip.name,
    pickup: stops[0]?.label ?? "",
    dropoff: stops[stops.length - 1]?.label ?? "",
    source: live ? (live.kind === "scheduled" ? "Reservation" : "Rider app") : ["Rider app", "Reservation", "Airport desk", "Street hail"][tripIndex(trip.id) % 4],
    driverName: driverName || "Unassigned",
    vehicle: plate ? (live ? vehicleName || tr(NOT_CONNECTED_TEXT) : "Volvo XC40") : "Unassigned",
    plate: plate || "Unassigned",
    seats: category.seats === null ? tr(NOT_CONNECTED_TEXT) : String(category.seats),
  };
}

export type DispatchRule = {
  zoneId: string;
  zoneName: string;
  offerSeconds: number;
  searchRadiusKm: number;
  nextTripKm: number;
  destinationMode: boolean;
  maxWaitMin: number;
  cancelRatePct: number;
};

export function defaultDispatch(): DispatchRule[] {
  return ZONES.map(([zoneId, name]) => ({
    zoneId,
    zoneName: name,
    offerSeconds: 8.5,
    searchRadiusKm: zoneId === "ARN" || zoneId === "BMA" ? 8 : 5,
    nextTripKm: 30,
    destinationMode: zoneId !== "ARN",
    maxWaitMin: 5,
    cancelRatePct: 20,
  }));
}

export function dispatchError(rule: DispatchRule): string | null {
  if (rule.offerSeconds <= 0 || rule.offerSeconds > 60) return "Offer window must be between 0 and 60 seconds.";
  if (rule.searchRadiusKm <= 0 || rule.searchRadiusKm > 100) return "Search radius must be between 0 and 100 km.";
  if (rule.nextTripKm <= 0 || rule.nextTripKm > 100) return "Next-trip radius must be between 0 and 100 km.";
  if (rule.maxWaitMin < 0 || rule.maxWaitMin > 30) return "Max wait must be between 0 and 30 minutes.";
  if (rule.cancelRatePct < 0 || rule.cancelRatePct > 100) return "Cancellation rate must be between 0 and 100%.";
  return null;
}

export function driverCategory(id: string): Trip["category"] {
  return CATEGORIES[tripIndex(id) % CATEGORIES.length].id;
}

export function toOffer(driver: DemoRecord, vehicle?: DemoRecord | null): OfferDriver {
  const driverStatus = driver.status === "active" || driver.status === "suspended" ? driver.status : "on_hold";
  const status = vehicle && vehicle.status !== "eligible" ? "on_hold" : driverStatus;
  return {
    id: driver.id,
    name: driver.name,
    status,
    category: vehicle?.category ?? driverCategory(driver.id),
  };
}

export function offersFor(
  trip: DemoRecord,
  drivers: readonly DemoRecord[],
  vehicles?: readonly DemoRecord[],
): OfferDriver[] {
  const candidates = drivers.map((driver) => {
    if (!vehicles) return toOffer(driver);
    const vehicle = vehicles.find((item) => item.driverId === driver.id) ?? null;
    return toOffer(driver, vehicle ?? { ...driver, status: "ineligible" });
  });
  return eligibleDrivers(asTrip(trip), candidates);
}

export type LiveKind = "driver" | "trip" | "request" | "queue" | "boost";

export type LiveMarker = {
  id: string;
  kind: LiveKind;
  name: string;
  lat: number;
  lng: number;
  stale: boolean;
  lastSeen: string;
  href: string;
  onMap: boolean;
};

function jitter(index: number, lat: number, lng: number): [number, number] {
  const angle = ((index * 47) % 360) * (Math.PI / 180);
  const radius = 0.004 + (index % 5) * 0.002;
  return [lat + Math.sin(angle) * radius, lng + Math.cos(angle) * radius];
}

export function insideFrame(lat: number, lng: number): boolean {
  return lat <= MAP_BOUNDS.north && lat >= MAP_BOUNDS.south && lng >= MAP_BOUNDS.west && lng <= MAP_BOUNDS.east;
}

export function projectMarker(lat: number, lng: number): { left: string; top: string } {
  const x = (lng - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west);
  const y = (MAP_BOUNDS.north - lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south);
  return { left: `${x * 100}%`, top: `${y * 100}%` };
}

const ACTIVE = new Set(["accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"]);

/** Live build: only drivers with a server position; no trip, queue or boost markers without a source. */
function serverMarkers(drivers: readonly DemoRecord[]): LiveMarker[] {
  return drivers.flatMap((driver) => {
    const live = liveDriverOf(driver);
    if (!live?.location) return [];
    const { lat, lng } = live.location;
    const stale = live.stale === true;
    return [{ id: driver.id, kind: "driver" as const, name: driver.name, lat, lng, stale, lastSeen: live.lastFixAt ?? live.location.measuredAt, href: `/drivers/${driver.id}`, onMap: insideFrame(lat, lng) }];
  });
}

export function liveMarkers(drivers: readonly DemoRecord[], trips: readonly DemoRecord[]): LiveMarker[] {
  if (isLiveData()) return serverMarkers(drivers);
  const driverMarks: LiveMarker[] = drivers.map((driver, index) => {
    const stale = index % 5 === 3;
    const [baseLat, baseLng] = ZONE_CENTER[driver.zoneId] ?? [59.33, 18.06];
    const [lat, lng] = jitter(index, baseLat, baseLng);
    return {
      id: driver.id,
      kind: "driver",
      name: driver.name,
      lat,
      lng,
      stale,
      lastSeen: stale ? `${8 + (index % 40)} min ago` : "now",
      href: `/drivers/${driver.id}`,
      onMap: insideFrame(lat, lng),
    };
  });
  const tripMarks: LiveMarker[] = trips
    .filter((trip) => ACTIVE.has(trip.status))
    .slice(0, 24)
    .map((trip) => {
      const [lat, lng] = jitter(tripIndex(trip.id), ...(ZONE_CENTER[trip.zoneId] ?? [59.33, 18.06]));
      return {
        id: trip.id,
        kind: "trip" as const,
        name: `${trip.id} · ${statusLabel(trip.status)}`,
        lat,
        lng,
        stale: false,
        lastSeen: "now",
        href: `/trips/${trip.id}`,
        onMap: insideFrame(lat, lng),
      };
    });
  const requests: LiveMarker[] = trips
    .filter((trip) => trip.status === "requested" || trip.status === "searching")
    .slice(0, 16)
    .map((trip) => {
      const [lat, lng] = jitter(tripIndex(trip.id) + 2, ...(ZONE_CENTER[trip.zoneId] ?? [59.33, 18.07]));
      return {
        id: `req-${trip.id}`,
        kind: "request" as const,
        name: tr("Open {0}", [trip.id]),
        lat,
        lng,
        stale: false,
        lastSeen: "now",
        href: `/trips/${trip.id}`,
        onMap: insideFrame(lat, lng),
      };
    });
  const queue: LiveMarker[] = [
    { id: "q-arn-1", name: tr("{0} queue {1}", ["Arlanda", 1]), lat: 59.651, lng: 17.923, href: "/trips/T0003" },
    { id: "q-arn-2", name: tr("{0} queue {1}", ["Arlanda", 2]), lat: 59.649, lng: 17.936, href: "/trips/T0006" },
    { id: "q-arn-3", name: tr("{0} queue {1}", ["Arlanda", 3]), lat: 59.646, lng: 17.918, href: "/trips/T0010" },
    { id: "q-bma-1", name: tr("{0} queue {1}", ["Bromma", 1]), lat: 59.355, lng: 17.95, href: "/trips/T0008" },
  ].map((item) => ({
    id: item.id,
    kind: "queue" as const,
    name: item.name,
    lat: item.lat,
    lng: item.lng,
    stale: false,
    lastSeen: "now",
    href: item.href,
    onMap: insideFrame(item.lat, item.lng),
  }));
  const boosts: LiveMarker[] = [
    { id: "boost-norrmalm", name: tr("{0} boost +{1}%", ["Norrmalm", 20]), lat: 59.336, lng: 18.058, href: "/pricing" },
    { id: "boost-sodermalm", name: tr("{0} boost +{1}%", ["Södermalm", 15]), lat: 59.316, lng: 18.066, href: "/pricing" },
    { id: "boost-kista", name: tr("{0} evening boost", ["Kista"]), lat: 59.401, lng: 17.95, href: "/pricing" },
  ].map((item) => ({
    id: item.id,
    kind: "boost" as const,
    name: item.name,
    lat: item.lat,
    lng: item.lng,
    stale: false,
    lastSeen: "now",
    href: item.href,
    onMap: insideFrame(item.lat, item.lng),
  }));
  return [...driverMarks, ...tripMarks, ...requests, ...queue, ...boosts];
}

export function moveMarker(marker: LiveMarker, tick: number): LiveMarker {
  if (isLiveData()) return marker;
  if (marker.stale || marker.kind !== "driver") return marker;
  const shift = Math.sin(tick / 2 + tripIndex(marker.id)) * 0.003;
  return { ...marker, lat: marker.lat + shift, lng: marker.lng + shift / 2 };
}

export function countTrips(trips: readonly DemoRecord[], status: string): number {
  return trips.filter((trip) => trip.status === status).length;
}

export { statusLabel, TRIP_STATUSES };
