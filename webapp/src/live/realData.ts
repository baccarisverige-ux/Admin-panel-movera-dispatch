/**
 * Owner rule, part 3 (2026-10-27): the live build shows only what the Movera server sends. Every demo helper that
 * derives a value from an id (hash, index, seed) asks here first: a live record answers with its server facts, and
 * a value the server does not send is NOT_CONNECTED ("Inte kopplad än / Pas encore connecté / Not connected yet"),
 * never an invented number or a zero.
 */
import type { DemoRecord, LiveDriverFacts, LiveRiderFacts, LiveTripFacts } from "../api/seed.ts";

/** The text a page shows for a value without a source (translated by the panel's dictionary). */
export const NOT_CONNECTED_TEXT = "Not connected yet";

let liveData = false;
const trips = new Map<string, LiveTripFacts>();
const drivers = new Map<string, LiveDriverFacts>();
const riders = new Map<string, LiveRiderFacts>();
const riderOfTrip = new Map<string, string>();
const createdOfTrip = new Map<string, string>();
const tripRecords = new Map<string, DemoRecord>();

/** Called once by the live AdminApi: from then on no helper may fall back to demo values. */
export function setLiveData(on: boolean): void {
  liveData = on;
  if (!on) {
    trips.clear();
    drivers.clear();
    riders.clear();
    riderOfTrip.clear();
    createdOfTrip.clear();
    tripRecords.clear();
  }
}

/** True in the live build (the panel reads the Movera server). */
export function isLiveData(): boolean {
  return liveData;
}

/** Keeps the server facts of records read from the server, so id-only helpers can find them. */
export function remember(records: readonly DemoRecord[]): void {
  for (const record of records) {
    if (record.liveTrip) {
      trips.set(record.id, record.liveTrip);
      if (record.tripId) riderOfTrip.set(record.id, record.tripId);
      if (record.createdAt) createdOfTrip.set(record.id, record.createdAt);
      tripRecords.set(record.id, record);
    }
    if (record.liveDriver) drivers.set(record.id, record.liveDriver);
    if (record.liveRider) riders.set(record.id, record.liveRider);
  }
}

export function liveTripOf(trip: Pick<DemoRecord, "id"> & { liveTrip?: LiveTripFacts }): LiveTripFacts | null {
  return trip.liveTrip ?? trips.get(trip.id) ?? null;
}

export function liveDriverOf(driver: Pick<DemoRecord, "id"> & { liveDriver?: LiveDriverFacts }): LiveDriverFacts | null {
  return driver.liveDriver ?? drivers.get(driver.id) ?? null;
}

export function liveRiderOf(rider: Pick<DemoRecord, "id"> & { liveRider?: LiveRiderFacts }): LiveRiderFacts | null {
  return rider.liveRider ?? riders.get(rider.id) ?? null;
}

/** The server's rider id of a live trip (TripProjection.riderId), or null. */
export function liveRiderIdOf(tripId: string): string | null {
  return riderOfTrip.get(tripId) ?? null;
}

/** A record that came from the server (owner rule: nothing on it is invented). */
export function isLiveRecord(record: { live?: true } | null | undefined): boolean {
  return Boolean(record?.live) || liveData;
}

/** When the server created a live trip, or null for a demo id. */
export function liveCreatedAt(tripId: string): string | null {
  return createdOfTrip.get(tripId) ?? null;
}

/** The live trips read so far that belong to a rider (TripProjection.riderId), newest first. */
export function liveTripsOfRider(riderId: string): DemoRecord[] {
  return [...tripRecords.values()].filter((trip) => trip.tripId === riderId).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
