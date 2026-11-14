import type { DemoRecord } from "../api/seed.ts";
import { parseMinor } from "../live/format.ts";
import { reservationActions, reservationCall, type ServerReservation } from "../live/reservations.ts";
import { formatMoney, market, MARKETS, marketOfZone, type MarketId } from "../markets/markets.ts";
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

/** The market of a currency the admin knows (SEK, EUR, TND), else undefined. */
function marketOfKnownCurrency(currency: string | null | undefined): MarketId | undefined {
  return currency ? MARKETS.find((item) => item.currency === currency)?.id : undefined;
}

/**
 * BQ-A30b S1: the country the reservation page counts and writes money in. On live it is the trip's currency's country
 * (a TND trip → Tunisia, even when its zone is not in the admin's zone list), else its zone's country, else Sweden.
 * The demo keeps its zone's country.
 */
export function raiseCountry(record: DemoRecord, live: boolean): MarketId {
  const ofCurrency = live ? marketOfKnownCurrency(record.liveTrip?.currency) : undefined;
  return ofCurrency ?? marketOfZone(record.zoneId)?.id ?? "SE";
}

/**
 * Check a live raise typed in major units and build its server call. The amount goes to minor units with the trip's
 * currency's own decimals (SEK öre ×100, TND millimes ×1000), never rounded: more decimals than the currency has is
 * refused. BQ-A30b: the limit check and its text use the same currency (S1); no known currency is refused, never SEK (S2).
 * `max` is in that currency's major units (the page's raiseMax for raiseCountry).
 */
export function liveRaise(
  book: ReservationBook,
  record: DemoRecord,
  text: string,
  max: number,
  actorId: string,
  nowIso: string,
  note = "",
): { error?: string; call?: { path: string; body: Record<string, unknown> } } {
  const trip = serverTripOf(record);
  const country = marketOfKnownCurrency(record.liveTrip?.currency) ?? marketOfZone(record.zoneId)?.id;
  if (!country) return { error: "The trip's currency is not known." };
  const currency = market(country).currency;
  const minor = parseMinor(text, currency);
  if (minor === null || minor <= 0) return { error: "Write a raise above 0." };
  const checked = raiseFare(book, record, minor / market(country).minorUnits, max, actorId, nowIso, raiseMaxText(max, country));
  if (checked.error) return { error: checked.error };
  if (!liveRaiseOpen(record)) return { error: "Only a ride without a driver can get a higher fare." };
  // trip.fare carries the same currency (tripFacts keeps fare and currency together), so the body says `currency`.
  return { call: reservationCall("raise", trip, { amountMinor: minor, reason: note }) };
}
