import { ApiError } from "../api/httpClient.ts";
import { tr } from "../i18n/index.ts";
import { liveMoney } from "./format.ts";
import type { LiveMoney } from "./types.ts";

/**
 * BQ-V38 stale-approve guard (contract v0.18.102, contract.json#payoutMode.approveGuard; owner item 105 / Q-M8
 * "Refresh, approve again (Rec.)", Rules decisions/session-2026-11-06.md:1119: "Movera never pays a total the admin did
 * not see"). Approve run carries what the admin saw: expectedCount + expectedTotal (one Money per currency). A changed
 * run is refused by the server (409 conflict, reason run_changed) with the fresh PayoutRunCard; the admin shows it and
 * the next Approve sends those fresh numbers.
 */

/** The server's numbers of a run at one moment (contract PayoutRunCard). */
export type PayoutRunCard = { country: string; periodEnd: string; count: number; total: LiveMoney[] };
export type ApproveRunValue = { country: string; periodEnd: string; expectedCount: number; expectedTotal: LiveMoney[] };

const isMoney = (value: unknown): value is LiveMoney =>
  Boolean(value) && typeof (value as LiveMoney).amountMinor === "number" && typeof (value as LiveMoney).currency === "string";

/** The fresh card of a run_changed refusal, else null. */
export function freshRunCard(error: unknown): PayoutRunCard | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.reason !== "run_changed") return null;
  const card = error.projection as Partial<PayoutRunCard> | null | undefined;
  if (!card || typeof card.country !== "string" || typeof card.periodEnd !== "string" || typeof card.count !== "number" || !Array.isArray(card.total) || !card.total.every(isMoney)) return null;
  return { country: card.country, periodEnd: card.periodEnd, count: card.count, total: card.total.map((m) => ({ amountMinor: m.amountMinor, currency: m.currency })) };
}

/**
 * What Approve run sends for a run: the server's fresh card of that same run when the admin was just shown one, else
 * the payouts on the run's card (their count, their Payout.amount per currency — kr, € and DT are never added).
 */
export function approveRunValue(run: { country: string; periodEnd: string }, rows: readonly { amount: LiveMoney }[], fresh: PayoutRunCard | null): ApproveRunValue {
  if (fresh && fresh.country === run.country && fresh.periodEnd === run.periodEnd) return { ...run, expectedCount: fresh.count, expectedTotal: fresh.total };
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.amount.currency, (totals.get(row.amount.currency) ?? 0) + row.amount.amountMinor);
  return { ...run, expectedCount: rows.length, expectedTotal: [...totals].map(([currency, amountMinor]) => ({ amountMinor, currency })) };
}

/** The expected numbers of an Approve run value, or null when the screen sent none (never approved blind). */
export function expectedOf(value: unknown): { expectedCount: number; expectedTotal: LiveMoney[] } | null {
  const v = (value ?? {}) as Partial<ApproveRunValue>;
  if (typeof v.expectedCount !== "number" || v.expectedCount < 1 || !Array.isArray(v.expectedTotal) || v.expectedTotal.length === 0 || !v.expectedTotal.every(isMoney)) return null;
  return { expectedCount: v.expectedCount, expectedTotal: v.expectedTotal.map((m) => ({ amountMinor: m.amountMinor, currency: m.currency })) };
}

/** The fresh total as the server sent it (one amount per currency, never added). */
export const runTotalText = (card: PayoutRunCard): string => card.total.map(liveMoney).join(" + ") || "—";

/** Why the approve was refused, with the server's fresh count and total (owner 105: the card refreshes, approve again). */
export function runChangedText(card: PayoutRunCard): string {
  return tr("The run changed while you looked. Payouts now: {0}. To pay now: {1}. It was reloaded; check it and approve again.", [card.count, runTotalText(card)]);
}

/** The run card's line after a refusal: the server's numbers the next Approve sends. */
export function freshCardLine(card: PayoutRunCard): string {
  return tr("Server now: {0} payouts · {1}", [card.count, runTotalText(card)]);
}
