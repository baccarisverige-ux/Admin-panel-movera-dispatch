import { tr } from "../i18n/core.ts";
import { isLiveData, liveTripOf } from "../live/realData.ts";
import type { DemoRecord } from "../api/seed.ts";
import type { Role } from "../auth/permissions.ts";
import { MARKETS, market, marketOfZone, type MarketId } from "../markets/markets.ts";
import type { PaymentMethod } from "./book.ts";
import { failureCause, failureHandled } from "./failures.ts";

/**
 * Payments desk: what each payment is, who gets what, failed payments with retries,
 * disputes with deadlines, numbers per method and the rules per country.
 * Values not in the records are demo values from the payment id.
 */

export const PAY_OPS_KEY = "paymentOps";

export const METHOD_LABELS: Record<PaymentMethod, string> = { card: "Card", apple: "Apple Pay", google: "Google Pay", cash: "Cash", wallet: "Wallet" };

const COUNTRY_METHODS: Record<MarketId, PaymentMethod[]> = {
  // Q7 FINAL: the same methods in every country (no Swish, Klarna or PayPal).
  SE: ["card", "card", "card", "apple", "apple", "google", "cash"],
  FR: ["card", "card", "card", "apple", "google", "cash"],
  TN: ["card", "cash", "cash", "wallet", "card"],
};

/** VAT included in a ride. Placeholders until finance confirms them (listed under "To confirm"). */
export const VAT: Record<MarketId, number> = { SE: 0.06, FR: 0.1, TN: 0.07 };
export const COMMISSION = 0.2;

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

export type PayGroup = "all" | "paid" | "failed" | "refunded" | "disputed" | "waiting";

export const PAY_GROUPS: { id: PayGroup; label: string; help: string }[] = [
  { id: "all", label: "All payments", help: "Every payment in the chosen country and zones." },
  { id: "paid", label: "Paid", help: "Captured: the money is taken." },
  { id: "failed", label: "Failed", help: "The payment did not go through. Retries are listed." },
  { id: "refunded", label: "Refunded", help: "Money given back to the rider." },
  { id: "disputed", label: "Disputes", help: "The rider's bank questions the payment (chargeback)." },
  { id: "waiting", label: "Waiting", help: "Authorised or pending, not taken yet." },
];

export type Dispute = { reason: string; openedAt: string; deadline: string; status: "open" | "evidence_sent" | "won" | "lost" | "accepted" };
export type DisputeSave = { status: Dispute["status"]; by: string; at: string; note: string };
export type RetrySave = { at: string; by: string; result: "paid" | "failed" };

export type PayRules = {
  retry: { on: boolean; afterHours: number[]; maxTries: number };
  owing: { on: boolean; overMajor: number; afterDays: number };
  /** Highest refund each role may give alone, in major units. Above it a second admin approves. */
  refundLimit: Partial<Record<Role, number>>;
};

export type PayOps = { draftRev: number; rules: Record<MarketId, PayRules>; retries: Record<string, RetrySave[]>; disputes: Record<string, DisputeSave[]> };

function rulesFor(country: MarketId): PayRules {
  const scale = country === "SE" ? 10 : country === "TN" ? 3 : 1;
  return { retry: { on: true, afterHours: [1, 24, 72], maxTries: 3 }, owing: { on: true, overMajor: 20 * scale, afterDays: 3 }, refundLimit: { support: 10 * scale, finance: 200 * scale, ops: 50 * scale } };
}

export function emptyPayOps(): PayOps {
  return { draftRev: 1, rules: { SE: rulesFor("SE"), FR: rulesFor("FR"), TN: rulesFor("TN") }, retries: {}, disputes: {} };
}

export function normalizePayOps(value: unknown): PayOps {
  const base = emptyPayOps();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<PayOps>;
  const rules = { ...base.rules };
  for (const item of MARKETS) {
    const saved = raw.rules?.[item.id];
    if (saved) rules[item.id] = { ...base.rules[item.id], ...saved, retry: { ...base.rules[item.id].retry, ...saved.retry }, owing: { ...base.rules[item.id].owing, ...saved.owing }, refundLimit: { ...base.rules[item.id].refundLimit, ...saved.refundLimit } };
  }
  return { draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1, rules, retries: raw.retries ?? {}, disputes: raw.disputes ?? {} };
}

export type PayFacts = {
  id: string;
  zoneId: string;
  country: MarketId;
  method: PaymentMethod;
  amount: number;
  status: string;
  group: Exclude<PayGroup, "all">;
  at: string;
  riderId: string | null;
  riderName: string;
  tripId: string | null;
  dispute: Dispute | null;
};

/** The demo dispute on a paid payment, if there is one, with what admins did since. */
export function disputeOf(record: DemoRecord, ops: PayOps, now: number): Dispute | null {
  if (record.status !== "captured") return null;
  const seed = hash(`dispute:${record.id}`);
  if (seed % 19 !== 0) return null;
  const reasons = ["Rider says they did not take the ride", "Charged twice", "Fraud: card used without permission", "Ride not as described"];
  const opened = now - (1 + (seed % 9)) * 86_400_000;
  const base: Dispute = { reason: reasons[(seed >>> 4) % reasons.length], openedAt: new Date(opened).toISOString(), deadline: new Date(opened + 10 * 86_400_000).toISOString().slice(0, 10), status: "open" };
  const last = ops.disputes[record.id]?.at(-1);
  return last ? { ...base, status: last.status } : base;
}

/** Live: the payment's own trip, method, time and the trip's rider; nothing picked from the id. */
function liveFacts(record: DemoRecord, trips: readonly DemoRecord[], ops: PayOps): PayFacts {
  const trip = record.tripId ? trips.find((row) => row.id === record.tripId) ?? null : null;
  const country = marketOfZone(trip?.zoneId ?? record.zoneId)?.id ?? "SE";
  const method: PaymentMethod = (["card", "apple", "google", "cash", "wallet"] as const).find((item) => item === record.name) ?? (record.name === "apple_pay" ? "apple" : record.name === "google_pay" ? "google" : "card");
  const retried = ops.retries[record.id]?.at(-1);
  const status = retried?.result === "paid" ? "captured" : record.status;
  const group: PayFacts["group"] = status === "captured" ? "paid" : status === "failed" ? "failed" : status === "refunded" || status === "partially_refunded" ? "refunded" : "waiting";
  return { id: record.id, zoneId: trip?.zoneId ?? record.zoneId, country, method, amount: record.fareOre ?? 0, status, group, at: record.createdAt ?? "", riderId: trip?.tripId ?? null, riderName: trip?.name ?? tr("Not connected yet"), tripId: record.tripId ?? null, dispute: null };
}

export function factsOf(record: DemoRecord, riders: readonly DemoRecord[], trips: readonly DemoRecord[], ops: PayOps, now: number): PayFacts {
  if (record.live || isLiveData()) return liveFacts(record, trips, ops);
  const country = marketOfZone(record.zoneId)?.id ?? "SE";
  const seed = hash(record.id);
  const methods = COUNTRY_METHODS[country];
  const method: PaymentMethod = record.name === "Wallet" ? "wallet" : methods[seed % methods.length];
  const local = riders.filter((row) => row.zoneId === record.zoneId);
  const rider = local.length ? local[seed % local.length] : riders[seed % Math.max(riders.length, 1)];
  const trip = rider ? trips.find((row) => row.name === rider.name && row.zoneId === record.zoneId) ?? null : null;
  const retried = ops.retries[record.id]?.at(-1);
  const status = retried?.result === "paid" ? "captured" : record.status;
  const dispute = disputeOf({ ...record, status }, ops, now);
  const group: PayFacts["group"] = dispute && (dispute.status === "open" || dispute.status === "evidence_sent") ? "disputed" : status === "captured" ? "paid" : status === "failed" ? "failed" : status === "refunded" ? "refunded" : "waiting";
  return { id: record.id, zoneId: record.zoneId, country, method, amount: record.fareOre ?? 0, status, group, at: new Date(now - (seed % (30 * 24 * 60)) * 60_000).toISOString(), riderId: rider?.id ?? null, riderName: rider?.name ?? "Rider", tripId: trip?.id ?? null, dispute };
}

export type PaySplit = { price: number; vat: number; vatRate: number; commission: number; driver: number; movera: number };

/** How a payment splits: driver, Movera's commission, and the VAT inside the price. */
export function paySplit(amount: number, country: MarketId, tripId?: string | null): PaySplit {
  if (isLiveData()) {
    // Live: the trip's commission and driver earnings from the server; VAT is not sent (NaN = "Not connected yet").
    const facts = tripId ? liveTripOf({ id: tripId }) : null;
    const commission = facts?.commission ?? NaN;
    return { price: amount, vat: NaN, vatRate: NaN, commission, driver: facts?.driverEarnings ?? NaN, movera: commission };
  }
  const vatRate = VAT[country];
  const commission = Math.round(amount * COMMISSION);
  return { price: amount, vat: Math.round((amount * vatRate) / (1 + vatRate)), vatRate, commission, driver: amount - commission, movera: commission };
}

export type RetryPlan = { tries: number; max: number; nextAt: string | null; cause: { kind: "rider" | "system"; reason: string }; handled: boolean; owing: boolean };

/** Failed payment: why, how many retries so far, when the next one runs, and if the rider is blocked for owing. */
export function retryPlan(record: DemoRecord, facts: PayFacts, ops: PayOps, now: number): RetryPlan {
  const rules = ops.rules[facts.country];
  const seed = hash(`retry:${record.id}`);
  const saved = ops.retries[record.id] ?? [];
  const tries = isLiveData() ? NaN : Math.min(rules.retry.maxTries, (seed % 2) + saved.length);
  const failedAt = Date.parse(facts.at);
  const next = !isLiveData() && rules.retry.on && tries < rules.retry.maxTries ? failedAt + (rules.retry.afterHours[tries] ?? rules.retry.afterHours.at(-1) ?? 24) * 3_600_000 : null;
  const days = (now - failedAt) / 86_400_000;
  const owing = rules.owing.on && facts.amount >= rules.owing.overMajor * market(facts.country).minorUnits && days >= rules.owing.afterDays;
  return { tries, max: rules.retry.maxTries, nextAt: next ? new Date(Math.max(next, now + 5 * 60_000)).toISOString() : null, cause: failureCause(record), handled: failureHandled(record), owing };
}

/** Refund limit for a role in the country, or null when the role has no limit (Super admin). */
export function refundLimitMinor(role: Role, country: MarketId, ops: PayOps): number | null {
  if (role === "super") return null;
  const major = ops.rules[country].refundLimit[role];
  return major === undefined ? 0 : major * market(country).minorUnits;
}

export type MethodRow = { method: PaymentMethod; label: string; count: number; paid: number; failed: number; success: number; amount: number };

export function byMethod(facts: readonly PayFacts[]): MethodRow[] {
  const rows = new Map<PaymentMethod, MethodRow>();
  for (const item of facts) {
    const row = rows.get(item.method) ?? { method: item.method, label: METHOD_LABELS[item.method], count: 0, paid: 0, failed: 0, success: 0, amount: 0 };
    row.count += 1;
    if (item.group === "paid" || item.group === "refunded" || item.group === "disputed") {
      row.paid += 1;
      row.amount += item.amount;
    }
    if (item.group === "failed") row.failed += 1;
    rows.set(item.method, row);
  }
  return [...rows.values()].map((row) => ({ ...row, success: row.count ? Math.round((row.paid / row.count) * 100) : 0 })).sort((a, b) => b.amount - a.amount);
}

export function retry(ops: PayOps, id: string, result: RetrySave["result"], by: string, at: string): PayOps {
  return { ...ops, draftRev: ops.draftRev + 1, retries: { ...ops.retries, [id]: [...(ops.retries[id] ?? []), { at, by, result }] } };
}

export function answerDispute(ops: PayOps, id: string, status: DisputeSave["status"], note: string, by: string, at: string): { ops: PayOps; error?: string } {
  if (status === "evidence_sent" && !note.trim()) return { ops, error: "Write what you send to the bank." };
  return { ops: { ...ops, draftRev: ops.draftRev + 1, disputes: { ...ops.disputes, [id]: [...(ops.disputes[id] ?? []), { status, note: note.trim(), by, at }] } } };
}

export function payRulesError(rules: PayRules): string | null {
  if (rules.retry.on) {
    if (rules.retry.maxTries < 1 || rules.retry.maxTries > 5) return "Retries: 1 to 5 tries.";
    if (rules.retry.afterHours.some((hours) => !Number.isFinite(hours) || hours < 1 || hours > 240)) return "Retries: 1 to 240 hours between tries.";
    if (rules.retry.afterHours.some((hours, index) => index > 0 && hours < rules.retry.afterHours[index - 1])) return "Retries: each try must come after the one before.";
  }
  if (rules.owing.on && (rules.owing.overMajor < 0 || rules.owing.afterDays < 0)) return "Owing rule: amounts and days must be zero or more.";
  if (Object.values(rules.refundLimit).some((value) => value === undefined || value < 0)) return "Refund limits must be zero or more.";
  return null;
}
