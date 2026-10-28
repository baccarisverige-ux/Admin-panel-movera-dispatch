import type { DemoRecord } from "../api/seed.ts";
import type { MoneySplit } from "./file.ts";
import { isLiveData, liveTripOf } from "../live/realData.ts";

/**
 * Cash trips (Round 3, Q23). The driver collects the fare in cash, so Movera's part (commission, app fee,
 * the fleet owner's part) is owed by the driver and taken from the next payout. Tips are paid in the app.
 */

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

/** Demo: about one trip in two in Tunisia and one in six elsewhere is paid in cash. */
export function isCashTrip(trip: Pick<DemoRecord, "id" | "zoneId" | "liveTrip">, country: string): boolean {
  // Live build: the trip's own paymentMethod from the server.
  const live = liveTripOf(trip);
  if (live) return live.paymentMethod === "cash";
  if (isLiveData()) return false;
  return hash(`${trip.id}:cash`) % (country === "TN" ? 2 : 6) === 1;
}

export type CashFigures = { collected: number; owed: number; driverKeeps: number };

/** What the driver collected and what they owe Movera, from the trip's money split. Null until the trip is paid. */
export function cashFigures(split: MoneySplit): CashFigures | null {
  if (split.state !== "charged") return null;
  if (split.live) {
    // Live: the server's lines. With no wallet part the driver collects the whole fare; Movera's part is its commission.
    const facts = split.live;
    return { collected: facts.cashToCollect ?? facts.fare, owed: facts.commission ?? NaN, driverKeeps: facts.driverEarnings ?? NaN };
  }
  const collected = split.riderPaid - split.tip;
  const driverKeeps = split.driverGets - split.tip;
  return { collected, owed: Math.max(0, collected - driverKeeps), driverKeeps };
}

/** The cash a driver owes Movera over a set of trips, to take from the next payout. */
export function cashOwed(trips: readonly DemoRecord[], driverId: string, splitOf: (trip: DemoRecord) => MoneySplit, countryOf: (trip: DemoRecord) => string): { minor: number; trips: number } {
  let minor = 0;
  let count = 0;
  for (const trip of trips) {
    if (trip.driverId !== driverId || !isCashTrip(trip, countryOf(trip))) continue;
    const figures = cashFigures(splitOf(trip));
    if (!figures || !figures.owed) continue;
    minor += figures.owed;
    count += 1;
  }
  return { minor, trips: count };
}
