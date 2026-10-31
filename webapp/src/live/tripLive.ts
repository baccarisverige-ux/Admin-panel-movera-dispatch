/**
 * Driver group 5 (contract v0.18.7, Rules decisions/driver-g5.md), the live trip facts the admin shows: the server's
 * road-route ETA and distance (status item 2 / Q4, contract.json#pickupWaiting.eta), the driver's position for the map
 * (adminLiveRow), the cancel fee in words (Q2 / Q6: which rule, paid or owed, the driver's share) and the rider's debt
 * per currency (Q3). Pure functions, so node --test covers them against the contract's fixture cases.
 */
import contract from "../../../contracts/contract.json" with { type: "json" };
import type { LatLng } from "../dashboard/route.ts";
import type { LiveTripFacts } from "../api/seed.ts";
import type { CancelReasonBook, LangId } from "../dispatch/offers.ts";
import { reasonText } from "../dispatch/offers.ts";
import { formatMoney, isCurrency } from "../domain/money.ts";

export type LiveEta = NonNullable<LiveTripFacts["eta"]>;
export type LiveCancellation = NonNullable<LiveTripFacts["cancellation"]>;

/** The server refreshes the ETA this often (contract.json#pickupWaiting.eta.everySeconds); the lists follow at the same pace. */
export const ETA_EVERY_SECONDS: number = contract.pickupWaiting.eta.everySeconds;
/** An ETA older than this is replaced by the server's estimate on reads; the admin greys it. */
export const ETA_STALE_AFTER_SECONDS: number = contract.pickupWaiting.eta.staleAfterSeconds;

/** Whole minutes rounded up, at least 1 (both apps show the same). */
export function etaMinutes(etaSeconds: number): number {
  return Math.max(1, Math.ceil(etaSeconds / 60));
}

/**
 * Owner 2026-10-29: kilometres with one decimal from 1 km (3.4 km), 100 m steps under 1 km (900, 800 m …), 10 m steps
 * under 100 m (90, 80 m …). Rounded DOWN so the number only shrinks as the car comes nearer; never under 10 m
 * (contract.json#pickupWaiting.eta.distanceDisplay, cases in fixtures/pickup_waiting.json#distanceDisplay).
 */
export function distanceDisplay(meters: number): { unit: "km" | "m"; value: number } {
  const whole = Math.max(0, Math.floor(meters));
  if (whole >= 1000) return { unit: "km", value: Math.floor(whole / 100) / 10 };
  if (whole >= 100) return { unit: "m", value: Math.floor(whole / 100) * 100 };
  return { unit: "m", value: Math.max(10, Math.floor(whole / 10) * 10) };
}

/** "3,4 km" (sv), "3.4 km" (en), "800 m": the number in the panel's language. */
export function formatDistance(meters: number, locale: string): string {
  const shown = distanceDisplay(meters);
  const number = new Intl.NumberFormat(locale, shown.unit === "km" ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }).format(shown.value);
  return `${number} ${shown.unit}`;
}

/** "4 min · 1,2 km": the live row's ETA and distance to the pickup or the drop-off. */
export function etaLine(eta: LiveEta, locale: string): string {
  return `${etaMinutes(eta.etaSeconds)} min · ${formatDistance(eta.distanceMeters, locale)}`;
}

/**
 * True when the ETA is the last known one: the server says source "stale" (no driver position for more than 120 s,
 * the previous number kept, checker round 1), or the admin's own copy is older than the contract's stale limit.
 */
export function etaIsStale(eta: LiveEta, nowMs: number): boolean {
  if (eta.source === "stale") return true;
  const at = Date.parse(eta.at);
  return Number.isFinite(at) && nowMs - at > ETA_STALE_AFTER_SECONDS * 1000;
}

/** The driver's way on the map: from the car to the pickup (to the drop-off once the rider is on board). */
export function approachOf(facts: Pick<LiveTripFacts, "driverLocation" | "eta" | "pickup" | "dropoff">): LatLng[] {
  if (!facts.driverLocation) return [];
  const target = facts.eta?.target === "dropoff" ? facts.dropoff : facts.pickup;
  return [[facts.driverLocation.lat, facts.driverLocation.lng], [target.lat, target.lng]];
}

/** The car as a point on the trip map, or none when the server sent no position. */
export function driverPointOf(facts: Pick<LiveTripFacts, "driverLocation">, label: string): { id: string; label: string; at: LatLng; tone: "driver" }[] {
  return facts.driverLocation ? [{ id: "driver", label, at: [facts.driverLocation.lat, facts.driverLocation.lng], tone: "driver" }] : [];
}

/** Money in the trip's currency ("65,00 kr", "6,50 €"); an unknown currency as "6.50 XYZ". */
export function tripMoney(amountMinor: number, currency: string): string {
  if (isCurrency(currency)) return formatMoney({ amountMinor, currency });
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

/** Which rule set the fee (Q2): the no-show fee or the cancel fee; null while no fee is on the trip. */
export function feeKindOf(cancellation: Pick<LiveCancellation, "feeMinor" | "feeKind"> | null): "cancel" | "no_show" | null {
  if (!cancellation || cancellation.feeMinor === null) return null;
  return cancellation.feeKind === "no_show" ? "no_show" : "cancel";
}

/** paid / owed / waived as the server says; an older server without feeStatus answers null. */
export function feeStatusOf(cancellation: Pick<LiveCancellation, "feeMinor" | "feeStatus"> | null): "paid" | "owed" | "waived" | null {
  if (!cancellation || cancellation.feeMinor === null) return null;
  return cancellation.feeStatus === "paid" || cancellation.feeStatus === "owed" || cancellation.feeStatus === "waived" ? cancellation.feeStatus : null;
}

/** The fee can be waived while it is on the trip and not waived yet (POST /admin/trips/{tripId}/adjust waiveCancelFee). */
export function canWaiveFee(cancellation: Pick<LiveCancellation, "feeMinor" | "feeStatus"> | null): boolean {
  return Boolean(cancellation && cancellation.feeMinor !== null && cancellation.feeMinor > 0 && cancellation.feeStatus !== "waived");
}

/**
 * The cancel reason in words: the admin's own title for the code (Dispatch › Cancel reasons, every group and the
 * no-show reason), else the code with its underscores as spaces, so the page never shows "rider_not_at_pickup".
 */
export function reasonWords(code: string | undefined | null, book: CancelReasonBook | null, lang: LangId): string {
  if (!code) return "";
  if (book) {
    const all = [...Object.values(book.groups).flat(), book.noShow];
    const hit = all.find((item) => item.code === code);
    const text = hit ? reasonText(hit.title, lang) : "";
    if (text) return text;
  }
  const plain = code.replace(/^(admin_|system_|next_trip_|scheduled_)/, "").replaceAll("_", " ").trim();
  return plain ? plain.charAt(0).toUpperCase() + plain.slice(1) : code;
}

/** The amounts a rider owes, one per currency (Q3): the server's list, else the one outstanding amount, else none. */
export function owedByCurrency(facts: { outstandingByCurrency?: { amountMinor: number; currency: string }[]; outstandingMinor: number | null; currency: string | null } | null | undefined): { amountMinor: number; currency: string }[] {
  if (!facts) return [];
  const list = (facts.outstandingByCurrency ?? []).filter((money) => money.amountMinor > 0);
  if (list.length) return list;
  return facts.outstandingMinor && facts.outstandingMinor > 0 && facts.currency ? [{ amountMinor: facts.outstandingMinor, currency: facts.currency }] : [];
}

/** "100,00 kr · 10,00 €": every owed amount in its own currency. */
export function owedText(owed: readonly { amountMinor: number; currency: string }[]): string {
  return owed.map((money) => tripMoney(money.amountMinor, money.currency)).join(" · ");
}

/** A trip going on with a driver (the live rows that carry a position and an ETA). */
export function isLiveWithDriver(status: string, driverId: string | null | undefined): boolean {
  return Boolean(driverId) && ["accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"].includes(status);
}
