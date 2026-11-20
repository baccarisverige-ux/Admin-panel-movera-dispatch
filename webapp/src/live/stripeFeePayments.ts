import { tr } from "../i18n/index.ts";
import type { LiveClient } from "./session.ts";

/**
 * Contract v0.18.136 stripeFees (DRAFT, Stripe TEST mode; owner 2026-11-20 "So we use stripe"), admin area c50: a
 * rider's card payments of owed fees (GET /admin/riders/{riderId}/fee-payments) and the Refund button
 * (POST /admin/riders/{riderId}/fees/{tripId}/stripe-refund). Every amount is the server's; nothing is computed here.
 */
export type StripeFeeStatus = "requires_payment" | "processing" | "succeeded" | "failed" | "canceled" | "refund_pending" | "refunded";
type Money = { amountMinor: number; currency: string };
export type StripeFeePayment = { tripId: string; paymentIntentId: string; amount: Money; status: StripeFeeStatus; createdAt: string; paidAt?: string; refundedAt?: string; paidTwice?: boolean; overpaid?: Money; amountMismatch?: boolean };

export const STRIPE_STATUS_LABEL: Record<StripeFeeStatus, string> = {
  requires_payment: "Waiting",
  processing: "Processing",
  succeeded: "Paid",
  failed: "Failed",
  canceled: "Cancelled",
  refund_pending: "Refund pending",
  refunded: "Refunded",
};

const money = (v: unknown): Money | null => {
  const m = v as Partial<Money> | null;
  return m && typeof m.amountMinor === "number" && typeof m.currency === "string" ? { amountMinor: m.amountMinor, currency: m.currency } : null;
};

/** The server's list as is (never the client secret); a row the page cannot read is left out. */
export function feePaymentsOf(body: unknown): StripeFeePayment[] {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((raw) => {
    const r = raw as Record<string, unknown>;
    const amount = money(r["amount"]);
    if (typeof r["tripId"] !== "string" || typeof r["paymentIntentId"] !== "string" || !amount || typeof r["status"] !== "string" || !(r["status"] in STRIPE_STATUS_LABEL) || typeof r["createdAt"] !== "string") return [];
    const overpaid = money(r["overpaid"]);
    return [{
      tripId: r["tripId"], paymentIntentId: r["paymentIntentId"], amount, status: r["status"] as StripeFeeStatus, createdAt: r["createdAt"],
      ...(typeof r["paidAt"] === "string" ? { paidAt: r["paidAt"] } : {}),
      ...(typeof r["refundedAt"] === "string" ? { refundedAt: r["refundedAt"] } : {}),
      ...(r["paidTwice"] === true ? { paidTwice: true } : {}),
      ...(overpaid ? { overpaid } : {}),
      ...(r["amountMismatch"] === true ? { amountMismatch: true } : {}),
    }];
  });
}

/** The "Paid twice" list: money that took nothing (or not all) off a debt, for the admin to refund. */
export const paidTwiceOf = (list: readonly StripeFeePayment[]) => list.filter((p) => p.paidTwice && p.status === "succeeded");

/** One Refund button per fee with a succeeded payment (the server picks the paid-twice payment first). */
export function refundableOf(list: readonly StripeFeePayment[]): StripeFeePayment[] {
  const seen = new Set<string>();
  return list.filter((p) => p.status === "succeeded" && !seen.has(p.tripId) && Boolean(seen.add(p.tripId)));
}

export async function loadFeePayments(client: LiveClient, riderId: string): Promise<StripeFeePayment[]> {
  return feePaymentsOf(await client.json(`/admin/riders/${encodeURIComponent(riderId)}/fee-payments`));
}

export async function refundFeePayment(client: LiveClient, riderId: string, tripId: string, reason: string): Promise<unknown> {
  const why = reason.trim();
  if (!why) throw new Error(tr("Write a reason."));
  return client.post(`/admin/riders/${encodeURIComponent(riderId)}/fees/${encodeURIComponent(tripId)}/stripe-refund`, { reason: why.slice(0, 300) });
}
