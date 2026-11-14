import type { DemoRecord } from "../api/seed.ts";
import type { MoneySplit } from "./file.ts";
import { isLiveData, liveTripOf } from "../live/realData.ts";

/**
 * Cash trips (Round 3, Q23). The driver collects the fare in cash, so Movera's part (commission, app fee)
 * is owed by the driver and taken from the next payout. Tips are paid in the app.
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
    // BQ-A29 (v0.18.89 §90 / v0.18.90): live = the server's numbers as sent — the cash to collect (TripFinish.cashToCollect,
    // else TripProjection.cashToCollect) and the driver's balance (TripFinish.owedToMovera: above 0 he owes Movera, below 0
    // Movera owes him). Not sent → NaN ("Not connected yet"), never the fare, the stored commission or a subtraction.
    const facts = split.live;
    const sent = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : NaN);
    return { collected: sent(facts.finishCashToCollect ?? facts.cashToCollect), owed: sent(facts.owedToMovera), driverKeeps: NaN };
  }
  const collected = split.riderPaid - split.tip;
  const driverKeeps = split.driverGets - split.tip;
  return { collected, owed: Math.max(0, collected - driverKeeps), driverKeeps };
}

/** The cash a driver owes Movera over a set of trips, to take from the next payout. */
export function cashOwed(trips: readonly DemoRecord[], driverId: string, splitOf: (trip: DemoRecord) => MoneySplit, countryOf: (trip: DemoRecord) => string): { minor: number; trips: number } {
  // BQ-A29 (contract.json#priceDisplay.owedToMovera "Sums over many trips come from the server (EarningsPeriod,
  // Payout.summary), not a phone sum"): no sum over live trips here.
  if (isLiveData()) return { minor: 0, trips: 0 };
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
