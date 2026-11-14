import type { DemoRecord } from "../api/seed.ts";
import { parseMinor } from "../live/format.ts";
import { reservationActions, reservationCall, type ServerReservation } from "../live/reservations.ts";
import { formatMoney, market, marketOfZone, type MarketId } from "../markets/markets.ts";
import { raiseFare, type ReservationBook } from "./book.ts";

/**
 * BQ-A30 (A26 supervisor S2): "Raise the fare" on /reservations/:id when it is reached on live. The demo saves its own
 * book (raiseFare); live posts the server's call, the same one as live/LiveReservations.tsx (reservationCall "raise" →
 * POST /admin/trips/{id}/driver-bonus with the trip's expectedVersion and the amount in the trip's currency). The server
 * checks the raise again. Pure functions, so node --test covers them.
 */

/** The highest raise with its currency's decimals (SEK 2 → "500,00 kr", TND 3 → "500.000 DT"), the page's one formatter. */
export function raiseMaxText(max: number, country: MarketId): string {
  return formatMoney(Math.round(max * market(country).minorUnits), country);
}

/** A live record as the server trip it came from. record.id is the server's tripId (record.tripId holds the rider id). */
function serverTripOf(record: DemoRecord): ServerReservation {
  const facts = record.liveTrip;
  return {
    tripId: record.id,
    status: record.status,
    version: typeof record.version === "number" ? record.version : 0,
    kind: facts?.kind ?? "scheduled",
    zoneId: record.zoneId,
    categoryId: facts?.categoryId ?? "",
    ...(record.pickupAt ? { scheduledAt: record.pickupAt } : {}),
    ...(facts && Number.isFinite(facts.fare) ? { fare: { amountMinor: facts.fare, currency: facts.currency } } : {}),
    driver: record.driverId ? { driverId: record.driverId } : null,
  };
}

/** On live the raise box is open for the server's no-driver statuses, the same rule as the Reservations list. */
export function liveRaiseOpen(record: DemoRecord): boolean {
  return !record.driverId && reservationActions(serverTripOf(record)).includes("raise");
}

/**
 * Check a live raise typed in major units and build its server call. The amount goes to minor units with the trip's
 * currency's own decimals (SEK öre ×100, TND millimes ×1000), never rounded: more decimals than the currency has is
 * refused. The highest raise is shown with its decimals.
 */
export function liveRaise(
  book: ReservationBook,
  record: DemoRecord,
  text: string,
  max: number,
  country: MarketId,
  actorId: string,
  nowIso: string,
  note = "",
): { error?: string; call?: { path: string; body: Record<string, unknown> } } {
  const trip = serverTripOf(record);
  const currency = trip.fare?.currency ?? marketOfZone(record.zoneId)?.currency ?? market(country).currency;
  const minor = parseMinor(text, currency);
  if (minor === null || minor <= 0) return { error: "Write a raise above 0." };
  const units = market(country).minorUnits;
  const checked = raiseFare(book, record, minor / units, max, actorId, nowIso, "", raiseMaxText(max, country));
  if (checked.error) return { error: checked.error };
  if (!liveRaiseOpen(record)) return { error: "Only a ride without a driver can get a higher fare." };
  return { call: reservationCall("raise", trip, { amountMinor: minor, reason: note }) };
}
