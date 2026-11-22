import { tr } from "../i18n/index.ts";
import type { LiveClient } from "./session.ts";

/**
 * Contract v0.18.136 stripeFees (DRAFT, Stripe test or live keys; owner 2026-11-20 "So we use stripe"), admin area c50: a
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
  // Review SHOULD 3: the paid-twice payment of a fee first (the one the server refunds first).
  const seen = new Set<string>();
  const ordered = [...list].sort((a, b) => Number(Boolean(b.paidTwice)) - Number(Boolean(a.paidTwice)));
  return ordered.filter((p) => p.status === "succeeded" && !seen.has(p.tripId) && Boolean(seen.add(p.tripId)));
}

export async function loadFeePayments(client: LiveClient, riderId: string): Promise<StripeFeePayment[]> {
  return feePaymentsOf(await client.json(`/admin/riders/${encodeURIComponent(riderId)}/fee-payments`));
}

export async function refundFeePayment(client: LiveClient, riderId: string, tripId: string, reason: string): Promise<unknown> {
  const why = reason.trim();
  if (!why) throw new Error(tr("Write a reason."));
  return client.post(`/admin/riders/${encodeURIComponent(riderId)}/fees/${encodeURIComponent(tripId)}/stripe-refund`, { reason: why.slice(0, 300) });
}

/**
 * Stripe live mode (owner 2026-11-21 "Yes, build live mode now (Recommended)", contract.json#stripeFees.status): the
 * server's Stripe mode, GET /admin/payments/stripe-status (finance.read) -> { mode: live | test | off, reason? }. Never a
 * key. Shown under Card payment of fees; one whole sentence per state (the server decides, nothing is guessed here).
 */
export type StripeServerStatus = { mode: "live" } | { mode: "test" } | { mode: "off"; reason: StripeOffReason } | { mode: "unknown" };
export type StripeOffReason = "no_keys" | "keys_incomplete" | "mixed_keys" | "bad_webhook_secret" | "test_keys_in_production" | "live_keys_outside_production";
export const STRIPE_OFF_TEXT: Record<StripeOffReason, string> = {
  no_keys: "Stripe: Off. No Stripe keys on the server.",
  keys_incomplete: "Stripe: Off. A Stripe key is missing on the server.",
  mixed_keys: "Stripe: Off. The server has a mix of test and live keys.",
  bad_webhook_secret: "Stripe: Off. The Stripe webhook secret is not valid.",
  test_keys_in_production: "Stripe: Off. Test keys on the production server.",
  live_keys_outside_production: "Stripe: Off. Live keys on a test server.",
};

/** The server's answer as is; anything the page cannot read is "unknown" (never shown as Live or Test). */
export function stripeServerStatusOf(body: unknown): StripeServerStatus {
  const b = (body ?? {}) as { mode?: unknown; reason?: unknown };
  if (b.mode === "live" || b.mode === "test") return { mode: b.mode };
  if (b.mode === "off" && typeof b.reason === "string" && b.reason in STRIPE_OFF_TEXT) return { mode: "off", reason: b.reason as StripeOffReason };
  return { mode: "unknown" };
}

/** The English key of the line (tr() translates it). */
export function stripeStatusText(status: StripeServerStatus): string {
  if (status.mode === "live") return "Stripe: Live (real card payments).";
  if (status.mode === "test") return "Stripe: Test (no real money).";
  if (status.mode === "off") return STRIPE_OFF_TEXT[status.reason];
  return "Stripe: status not known.";
}

/** A setup mistake (anything off but "no keys", or unknown): the line is shown as a warning. */
export const stripeStatusIsProblem = (status: StripeServerStatus) => status.mode === "unknown" || (status.mode === "off" && status.reason !== "no_keys");

export async function loadStripeServerStatus(client: LiveClient): Promise<StripeServerStatus> {
  return stripeServerStatusOf(await client.json("/admin/payments/stripe-status"));
}
