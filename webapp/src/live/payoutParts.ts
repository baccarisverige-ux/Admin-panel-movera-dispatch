import { tr } from "../i18n/index.ts";
import { liveMoney } from "./format.ts";
import type { PayoutRunCard } from "./payoutRunGuard.ts";

/**
 * S5 J14 (contract v0.18.133 contract.json#payoutLines; owner 2026-11-19 "driver payout 3 lines", "carry line only when
 * needed"): the payout's parts as the server sent them — Earned · Owed to Movera · Paid out, and "Moves to next week"
 * only when it is above 0. Nothing is worked out here (the apps never compute money). A payout without the parts (made
 * before the switch, or an older server) → null: the card keeps the v0.18.89 two lines.
 */
type Money = { amountMinor: number; currency: string };
type MoneyLike = Money | null | undefined;
export type PartLine = { key: "earned" | "owedToMovera" | "paidOut" | "carriedOut"; label: string; text: string; amount: Money };
export type PayoutParts = { earned?: MoneyLike; owedToMovera?: MoneyLike; paidOut?: MoneyLike; carriedIn?: MoneyLike; carriedOut?: MoneyLike };

const real = (value: unknown): value is Money =>
  Boolean(value) && Number.isFinite((value as Money).amountMinor) && typeof (value as Money).currency === "string";

const LABEL = { earned: "Earned", owedToMovera: "Owed to Movera", paidOut: "Paid out", carriedOut: "Moves to next week" } as const;

/** The three lines (+ "Moves to next week" when above 0) of one payout, or null when the server sent no parts. */
export function payoutPartLines(payout: PayoutParts): PartLine[] | null {
  const { earned, owedToMovera, paidOut, carriedOut } = payout;
  if (!real(earned) || !real(owedToMovera) || !real(paidOut) || !real(carriedOut)) return null;
  const lines: PartLine[] = (["earned", "owedToMovera", "paidOut"] as const).map((key) => ({ key, label: tr(LABEL[key]), text: liveMoney(payout[key] as Money), amount: payout[key] as Money }));
  if (carriedOut.amountMinor > 0) lines.push({ key: "carriedOut", label: tr(LABEL.carriedOut), text: liveMoney(carriedOut), amount: carriedOut });
  return lines;
}

/** One waiting run as GET /admin/payouts/runs sends it: the server's count and totals over every payout of the run. */
export type ServerRun = PayoutRunCard & { periodStart: string; earned: Money[]; owedToMovera: Money[]; paidOut: Money[]; carriedOut: Money[] };

/** The runs of a GET /admin/payouts/runs answer, or null when it is not one (an older server: the card counts its page). */
export function serverRunsOf(answer: unknown): ServerRun[] | null {
  const items = (answer as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  const out: ServerRun[] = [];
  for (const raw of items as Partial<ServerRun>[]) {
    const lists = [raw.total, raw.earned, raw.owedToMovera, raw.paidOut, raw.carriedOut];
    if (typeof raw.country !== "string" || typeof raw.periodEnd !== "string" || typeof raw.periodStart !== "string" || typeof raw.count !== "number" || !lists.every((l) => Array.isArray(l) && l.every(real))) return null;
    out.push(raw as ServerRun);
  }
  return out;
}

/** The run card's line from the server's totals (one amount per currency, never added): the same lines as a payout. */
export function runPartLines(run: ServerRun): { key: PartLine["key"]; label: string; text: string }[] {
  const join = (list: Money[]) => list.map(liveMoney).join(" + ");
  const lines: { key: PartLine["key"]; label: string; text: string }[] = (["earned", "owedToMovera", "paidOut"] as const).map((key) => ({ key, label: tr(LABEL[key]), text: join(run[key]) }));
  if (run.carriedOut.some((m) => m.amountMinor > 0)) lines.push({ key: "carriedOut", label: tr(LABEL.carriedOut), text: join(run.carriedOut.filter((m) => m.amountMinor > 0)) });
  return lines;
}

/** The server's card of a run (count and total), what Approve run sends when no fresher card was shown. */
export const runCardOf = (run: ServerRun): PayoutRunCard => ({ country: run.country, periodEnd: run.periodEnd, count: run.count, total: run.total });
