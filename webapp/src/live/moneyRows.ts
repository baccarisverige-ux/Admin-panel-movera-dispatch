import { tr } from "../i18n/index.ts";
import { liveMoney } from "./format.ts";

/**
 * BQ-M24 / BQ-M22 (contract v0.18.92; owner 2026-11-13 23:42 UTC "Movera commission is how much movera keep",
 * Rules decisions/session-2026-11-06.md:1263; owner rule: the apps never work money out — they show the server's
 * numbers). The admin's money rows, each ONE server number; the fields are optional (an older server sends none).
 */
type MoneyLike = { amountMinor: number; currency: string } | null | undefined;
type Money = { amountMinor: number; currency: string };

const real = (value: MoneyLike): value is Money => Boolean(value && Number.isFinite(value.amountMinor) && typeof value.currency === "string");

/**
 * contract.json#moneyBase.commissionRow.admin: every "Movera commission" row of a trip shows the admin view's
 * TripProjection.moveraKeepsNow — paid, ended unpaid or under way, the server works it out. Never the stored
 * commission, never a subtraction here. null → the row reads "Not connected yet".
 */
export function moveraCommissionRow(trip: { moveraKeepsNow?: MoneyLike; commission?: MoneyLike }): Money | null {
  return real(trip.moveraKeepsNow) ? { amountMinor: trip.moveraKeepsNow.amountMinor, currency: trip.moveraKeepsNow.currency } : null;
}

/** contract.json#moneyBase.lostDriverPaid (admin TripProjection.lostDriverPaid): "Paid to the driver who lost the trip", only above 0. */
export function lostDriverRow(trip: { lostDriverPaid?: MoneyLike }): Money | null {
  return real(trip.lostDriverPaid) && trip.lostDriverPaid.amountMinor > 0 ? { amountMinor: trip.lostDriverPaid.amountMinor, currency: trip.lostDriverPaid.currency } : null;
}

export type PayoutSummary = { driverGets: MoneyLike; moveraGets: MoneyLike };
export type SummaryLine = { key: "driverGets" | "moveraGets"; label: string; text: string; amount: Money };

/**
 * contract.json#priceDisplay.payoutSummary.display: exactly two lines on every payout card — "Driver gets" /
 * "Movera gets", amounts only (no %), the server's own numbers. null (an older server) → the card shows Payout.amount only.
 */
export function payoutSummaryLines(payout: { summary?: PayoutSummary | null }): SummaryLine[] | null {
  const summary = payout.summary;
  if (!summary || !real(summary.driverGets) || !real(summary.moveraGets)) return null;
  return [
    { key: "driverGets", label: tr("Driver gets"), text: liveMoney(summary.driverGets), amount: summary.driverGets },
    { key: "moveraGets", label: tr("Movera gets"), text: liveMoney(summary.moveraGets), amount: summary.moveraGets },
  ];
}

/**
 * The payout run card: each payout of the run with its own two lines (nothing is added up in the app). null when one
 * payout has no summary (an older server) → the card keeps today's count and amounts.
 */
export function runSummaryRows(rows: readonly { payoutId: string; driverId: string; driverName?: string; summary?: PayoutSummary | null }[]): { payoutId: string; who: string; lines: SummaryLine[] }[] | null {
  const out: { payoutId: string; who: string; lines: SummaryLine[] }[] = [];
  for (const row of rows) {
    const lines = payoutSummaryLines(row);
    if (!lines) return null;
    out.push({ payoutId: row.payoutId, who: row.driverName ?? row.driverId, lines });
  }
  return out;
}

export type BalanceLine = { kind: "driver_owes" | "movera_owes" | "settled"; text: string; amount: Money };

/**
 * BQ-A29 (contract.json#priceDisplay.owedToMovera, v0.18.90 text; driver and admin views): the driver's balance after
 * the trip, the server's TripFinish.owedToMovera as sent. Above 0: "Driver owes Movera X"; below 0: "Movera owes the
 * driver X" (the amount shown without its sign, as the contract says); 0: "Settled". Absent (an older server, a trip
 * not ended) → null: the line is hidden. Nothing is worked out here.
 */
export function driverBalanceLine(owed: MoneyLike): BalanceLine | null {
  if (!real(owed)) return null;
  if (owed.amountMinor === 0) return { kind: "settled", text: tr("Settled"), amount: owed };
  if (owed.amountMinor > 0) return { kind: "driver_owes", text: tr("Driver owes Movera {0}", [liveMoney(owed)]), amount: owed };
  const shown = { amountMinor: -owed.amountMinor, currency: owed.currency };
  return { kind: "movera_owes", text: tr("Movera owes the driver {0}", [liveMoney(shown)]), amount: owed };
}

/**
 * BQ-A29 (contract.json#priceDisplay.routeChange): the route-change card's "Driver gets" = TripRouteChange.driverTotal
 * (what he gets for the whole trip with the new route) as sent; absent → null (the line is hidden, never driverEarnings).
 */
export function routeChangeDriverGets(change: { driverTotalMinor?: number | null }): number | null {
  return typeof change.driverTotalMinor === "number" && Number.isFinite(change.driverTotalMinor) ? change.driverTotalMinor : null;
}
