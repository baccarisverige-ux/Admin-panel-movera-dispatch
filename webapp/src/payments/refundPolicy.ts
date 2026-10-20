import { MARKETS, market, marketOfCurrency, type MarketId } from "../markets/markets.ts";

/**
 * The one "refund needs a second admin" rule (Q25, C-22): one limit per country, set in Settings. A refund
 * (or a driver pay change) above the limit waits for a second admin. The fixture server enforces it from the
 * stored setting; every screen reads the same setting, so there is no second number anywhere.
 */
export const REFUND_POLICY_KEY = "refundPolicy";

export type RefundPolicy = {
  draftRev: number;
  /** A refund above this amount, in major units of the country's currency (kr, €, DT), needs a second admin. */
  aboveMajor: Record<MarketId, number>;
};

/** The owner's defaults: above 500 kr, 50 € or 150 DT. */
export const DEFAULT_REFUND_ABOVE: Readonly<Record<MarketId, number>> = { SE: 500, FR: 50, TN: 150 };

/** Settings refuse a limit outside 0 to this (major units): a typo of an extra zero is caught. */
export const REFUND_ABOVE_MAX: Readonly<Record<MarketId, number>> = { SE: 100_000, FR: 10_000, TN: 30_000 };

export function defaultRefundPolicy(): RefundPolicy {
  return { draftRev: 1, aboveMajor: { ...DEFAULT_REFUND_ABOVE } };
}

/** A stored policy with every country and a valid number, or the defaults (C-26: stored data is checked). */
export function normalizeRefundPolicy(raw: unknown): RefundPolicy {
  const base = defaultRefundPolicy();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<RefundPolicy>;
  const aboveMajor = { ...base.aboveMajor };
  for (const item of MARKETS) {
    const saved = value.aboveMajor?.[item.id];
    if (typeof saved === "number" && Number.isFinite(saved) && saved >= 0) aboveMajor[item.id] = saved;
  }
  return { draftRev: typeof value.draftRev === "number" && Number.isFinite(value.draftRev) ? value.draftRev : 1, aboveMajor };
}

/** The limit in minor units of the country's currency (öre, cents, millimes). */
export function refundAboveMinor(policy: RefundPolicy, country: MarketId): number {
  return Math.round(policy.aboveMajor[country] * market(country).minorUnits);
}

/** True when a refund of this amount (minor units) in that country needs a second admin. */
export function needsSecondAdmin(policy: RefundPolicy, country: MarketId, amountMinor: number): boolean {
  return Math.abs(amountMinor) > refundAboveMinor(policy, country);
}

/** The same check for an amount stored with its currency (approvals, payments). */
export function needsSecondAdminIn(policy: RefundPolicy, currency: "SEK" | "EUR" | "TND", amountMinor: number): boolean {
  return needsSecondAdmin(policy, marketOfCurrency(currency), amountMinor);
}

export function refundPolicyError(policy: RefundPolicy): string | null {
  for (const item of MARKETS) {
    const value = policy.aboveMajor[item.id];
    if (!Number.isFinite(value) || value < 0) return `The second-admin limit for ${item.name} must be zero or more.`;
    if (value > REFUND_ABOVE_MAX[item.id]) return `The second-admin limit for ${item.name} is at most ${REFUND_ABOVE_MAX[item.id]}.`;
  }
  return null;
}

/**
 * The limits a save sends, checked as sent: a missing, negative or non-number value is an error, not
 * quietly replaced by a default (the server uses this, C-26).
 */
export function parseRefundAbove(raw: unknown): { aboveMajor: Record<MarketId, number> } | { error: string } {
  const sent = raw && typeof raw === "object" ? (raw as { aboveMajor?: unknown }).aboveMajor : undefined;
  if (!sent || typeof sent !== "object") return { error: "Send a second-admin limit for every country." };
  const aboveMajor = {} as Record<MarketId, number>;
  for (const item of MARKETS) {
    const value = (sent as Record<string, unknown>)[item.id];
    if (typeof value !== "number" || !Number.isFinite(value)) return { error: `The second-admin limit for ${item.name} must be a number.` };
    aboveMajor[item.id] = value;
  }
  const error = refundPolicyError({ draftRev: 1, aboveMajor });
  return error ? { error } : { aboveMajor };
}

export function saveRefundPolicy(policy: RefundPolicy, aboveMajor: Record<MarketId, number>): { policy: RefundPolicy; error?: string } {
  const next = { draftRev: policy.draftRev + 1, aboveMajor: { ...aboveMajor } };
  const error = refundPolicyError(next);
  return error ? { policy, error } : { policy: next };
}
