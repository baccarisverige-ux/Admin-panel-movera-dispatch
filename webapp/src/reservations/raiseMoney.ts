import type { DemoRecord } from "../api/seed.ts";

/**
 * BQ-A26 (owner rule R2: the admin never works money out; amounts only; a missing number reads "Not connected yet"):
 * the "Raise the driver's fare" box of a live booked ride shows the server's numbers only — the trip's fare
 * (TripProjection.fare) and what Movera keeps (the admin TripProjection.moveraKeepsNow, contract v0.18.92
 * moneyBase.commissionRow.admin: under way = the trip's commission − lostDriverPaid, worked out by the server). Never the
 * fare × the price book's %, and no "beyond / left of the commission" sums (showSums false); the rule stays as text.
 * NaN = not sent → formatMoney reads "Not connected yet". null = the demo, which keeps its own numbers.
 */
export function liveReservationMoney(record: DemoRecord, live: boolean): { fareMinor: number; moveraKeepsMinor: number; showSums: false } | null {
  if (!live && !record.live) return null;
  const real = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : Number.NaN);
  return { fareMinor: real(record.liveTrip?.fare), moveraKeepsMinor: real(record.liveTrip?.moveraKeepsNow), showSums: false };
}
