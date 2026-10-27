import { TRIP_STATUSES } from "../domain/contract.ts";
import { groupOf, VAT_RATE, type MoneySplit, type TripGroup } from "../trips/file.ts";
import { canRefundTrip } from "../trips/rules.ts";
import { market, marketOfZone, type Market, type MarketId } from "../markets/markets.ts";
import type { Trip } from "./types.ts";

/**
 * The demo Trips pages (pages/TripsPage.tsx, pages/TripPage.tsx) read from the server's TripProjection: the groups,
 * the money split, the fare lines and the refund rules, worked out from what GET /admin/trips(/{id}) sends.
 */

/** The demo's groups the server can filter on. "Flagged" has no server field (no flag on a trip), so it is not here. */
export type LiveGroup = Exclude<TripGroup, "flagged">;

/** The statuses of a demo group, from the demo's own groupOf (so both pages always agree). */
export function groupStatuses(group: LiveGroup): string[] {
  if (group === "all") return [];
  return TRIP_STATUSES.filter((status) => groupOf(status) === group);
}

/**
 * The status=… values of GET /admin/trips for a group and the Trip status filter together: null when they cannot both
 * hold (for example Completed and "In trip"), so nothing is asked.
 */
export function statusQuery(group: LiveGroup, status: string): string[] | null {
  if (status === "all") return groupStatuses(group);
  if (group === "all" || groupOf(status) === group) return [status];
  return null;
}

/** The market of a server zone id; Sweden when the zone is not in the panel's markets. */
export function marketOf(zoneId: string): Market {
  return marketOfZone(zoneId) ?? market("SE");
}

/** Midnight of a YYYY-MM-DD day in a time zone, as an ISO instant (the From and To date filters). */
export function dayStart(day: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // The zone's offset at that moment: format the UTC instant in the zone and compare.
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(utc));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(utc - (shown - utc)).toISOString();
}

/** from=… and to=… of GET /admin/trips: from the start of From to the end of To (the server's to is exclusive). */
export function dateQuery(from: string, to: string, timeZone: string): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  const start = from ? dayStart(from, timeZone) : null;
  if (start) out.from = start;
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const next = new Date(Date.parse(`${to}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const end = dayStart(next, timeZone);
    if (end) out.to = end;
  }
  return out;
}

/** contract.json#fareLines: the name of each fare line code, as the trip page shows it. */
export const FARE_LINE_LABEL: Record<string, string> = {
  base: "Base fare",
  distance: "Distance",
  time: "Time",
  stops: "Extra stops",
  waiting: "Waiting time",
  pickup_fee: "Pickup fee",
  surge: "Surge",
  discount: "Discount",
  cancel_fee: "Cancel fee",
  app_fee: "App fee",
  minimum_adjust: "Minimum applied",
  maximum_adjust: "Maximum applied",
  stop_waiting: "Waiting at stops",
  extras: "Extras",
  airport: "Airport fee",
  reservation_fee: "Reservation fee",
  fixed_route: "Fixed route",
  rounding: "Rounding",
  outstanding_fee: "Earlier unpaid fee",
  rider_raise: "Rider raised the offer",
  pickup_pay: "Pickup pay",
  driver_bonus: "Money added for the driver",
};

/** The two fare lines only the driver and admins see (contract.json#fareLines.driverOnly): not part of the rider's price. */
export const DRIVER_ONLY_LINES = ["pickup_pay", "driver_bonus"];

/** contract.json#paymentMethods, by name. */
export const PAYMENT_METHOD_LABEL: Record<string, string> = { card: "Card", apple_pay: "Apple Pay", google_pay: "Google Pay", cash: "Cash", wallet: "Wallet" };

export function lineAmount(trip: Pick<Trip, "fareLines">, code: string): number {
  return (trip.fareLines ?? []).filter((line) => line.code === code).reduce((sum, line) => sum + line.amount.amountMinor, 0);
}

const TERMINAL = ["completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_by_admin", "cancelled_by_system", "no_show", "expired", "failed"];

export function isTerminal(status: string): boolean {
  return TERMINAL.includes(status);
}

/**
 * The demo's "Who gets what" (MoneySplit) from the server's money: the fare is the trip price, driverEarnings plus
 * pickupPay plus driverBonus is what the driver gets, and Movera keeps the rest (the server's commission). Tips,
 * promotions paid by Movera, admin pay changes and fleet shares are not on the projection, so they are 0 here.
 * `refunded`: the refunds already made on this trip.
 */
export function liveSplit(trip: Trip, refunded: number): MoneySplit {
  const country = marketOf(trip.zoneId).id as MarketId;
  const price = trip.fare.amountMinor;
  const cancelled = trip.status.startsWith("cancelled") || trip.status === "no_show" || trip.status === "expired";
  const state: MoneySplit["state"] = trip.status === "failed" || (cancelled && price <= 0) ? "none" : cancelled ? "cancel_fee" : isTerminal(trip.status) ? "charged" : "estimate";
  const appFee = lineAmount(trip, "app_fee");
  const ridePrice = price - appFee;
  const commission = trip.commission?.amountMinor ?? 0;
  const driverBonus = trip.driverBonus?.amountMinor ?? 0;
  const driverGets = (trip.driverEarnings?.amountMinor ?? 0) + (trip.pickupPay?.amountMinor ?? 0) + driverBonus;
  const riderPaid = price - refunded;
  const vatRate = VAT_RATE[country];
  return {
    country,
    state,
    price,
    appFee,
    ridePrice,
    commissionPct: ridePrice > 0 ? Math.round((commission / ridePrice) * 100) : 0,
    commission,
    promo: 0,
    tip: 0,
    refunded,
    payChange: 0,
    vat: Math.round((price * vatRate) / (1 + vatRate)),
    vatRate,
    fleetPct: 0,
    fleet: 0,
    riderPaid,
    driverGets,
    moveraKeeps: riderPaid - driverGets,
    driverBonus,
  };
}

/** The refunds already made on a trip, from its audit (trip.refund entries carry the amount). */
export function refundedSoFar(entries: readonly { action: string; after?: unknown }[]): number {
  return entries
    .filter((entry) => entry.action === "trip.refund")
    .reduce((sum, entry) => sum + Number(((entry.after ?? {}) as { amount?: { amountMinor?: number } }).amount?.amountMinor ?? 0), 0);
}

/**
 * The demo's refund rules (trips/present.ts refundBlock) with the server's payment states: why a refund cannot be made
 * now, or null. Not on an expired trip; only once the money was taken; not when everything is already back.
 */
export function liveRefundBlock(trip: Pick<Trip, "status" | "paymentStatus">, left: number): string | null {
  if (!canRefundTrip(trip.status)) return "Refund is only available after the trip reaches a refundable terminal state.";
  if (trip.paymentStatus === "refunded" || (trip.paymentStatus === "partially_refunded" && left <= 0)) return "This payment is already refunded.";
  if (trip.paymentStatus !== "captured" && trip.paymentStatus !== "partially_refunded") return "Refund is only available after the payment is captured.";
  return null;
}

/** Server rules of POST /admin/trips/{id}/adjust (admin/trips.ts): the fare and waiting time change only while a driver has the trip. */
export function liveAdjustBlock(status: string): string | null {
  if (isTerminal(status)) return "This trip is paid; use a refund.";
  if (["draft", "quoted", "requested", "searching", "offered"].includes(status)) return "Change the fare after a driver accepted.";
  return null;
}

export function liveWaitingBlock(trip: Pick<Trip, "status" | "waiting">): string | null {
  return liveAdjustBlock(trip.status) ?? (trip.waiting ? null : "The driver has not arrived yet.");
}

/** Distance along the driver's GPS fixes, in km with one decimal; null with fewer than two fixes. */
export function traceKm(fixes: readonly { lat: number; lng: number }[]): number | null {
  if (fixes.length < 2) return null;
  let km = 0;
  for (let index = 1; index < fixes.length; index += 1) {
    const a = fixes[index - 1]!;
    const b = fixes[index]!;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    km += 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  return Math.round(km * 10) / 10;
}
