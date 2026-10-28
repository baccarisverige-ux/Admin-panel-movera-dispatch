import type { DemoRecord } from "../api/seed.ts";
import type { MarketId } from "../markets/markets.ts";
import { isLiveData } from "../live/realData.ts";

/**
 * Fraud rules per country, the signals they read for each rider and driver, a score,
 * and the review an admin made. Signals are demo values from the person's id until the
 * backend sends real ones.
 */

export const RISK_KEY = "riskOps";

export type RuleId = "fake_gps" | "cancels" | "multi_account" | "shared_card" | "failed_payments" | "promo_abuse" | "low_rating";
export type RuleAction = "warn" | "review" | "block";
export type Who = "driver" | "rider";

export type RuleDef = { id: RuleId; label: string; help: string; who: Who[]; unit: string; min: number; max: number; step: number; worse: "up" | "down" };

export const RULES: RuleDef[] = [
  { id: "fake_gps", label: "Fake GPS", help: "Jumps faster than a car can drive, in the last 7 days. Usually a fake location app.", who: ["driver"], unit: "jumps", min: 1, max: 20, step: 1, worse: "up" },
  { id: "cancels", label: "Too many cancellations", help: "Share of accepted rides cancelled, last 30 days.", who: ["driver", "rider"], unit: "%", min: 5, max: 90, step: 1, worse: "up" },
  { id: "multi_account", label: "Many accounts on one phone", help: "Accounts made on the same phone.", who: ["driver", "rider"], unit: "accounts", min: 2, max: 10, step: 1, worse: "up" },
  { id: "shared_card", label: "One card on many accounts", help: "Accounts paying with the same card.", who: ["rider"], unit: "accounts", min: 2, max: 10, step: 1, worse: "up" },
  { id: "failed_payments", label: "Failed payments", help: "Payments that failed in the last 30 days.", who: ["rider"], unit: "payments", min: 1, max: 20, step: 1, worse: "up" },
  { id: "promo_abuse", label: "Promotion abuse", help: "Promotion codes used in the last 30 days.", who: ["rider"], unit: "codes", min: 2, max: 30, step: 1, worse: "up" },
  { id: "low_rating", label: "Low rating", help: "Average rating, last 50 rides.", who: ["driver"], unit: "stars", min: 1, max: 5, step: 0.1, worse: "down" },
];

export const ACTIONS: { id: RuleAction; label: string; help: string }[] = [
  { id: "warn", label: "Warn", help: "The person gets a message in the app." },
  { id: "review", label: "Review", help: "An admin checks before anything happens." },
  { id: "block", label: "Block", help: "Blocked at once. An admin can undo it." },
];

export type Rule = { id: RuleId; on: boolean; limit: number; action: RuleAction };
export type Decision = "cleared" | "warned" | "watch" | "blocked";
export type Review = { key: string; decision: Decision; by: string; at: string; note: string };

export type RiskOps = { draftRev: number; rules: Record<MarketId, Rule[]>; reviews: Review[]; history: { at: string; by: string; country: MarketId; changes: string[] }[] };

export function defaultRules(): Rule[] {
  return [
    { id: "fake_gps", on: true, limit: 3, action: "block" },
    { id: "cancels", on: true, limit: 35, action: "review" },
    { id: "multi_account", on: true, limit: 3, action: "review" },
    { id: "shared_card", on: true, limit: 3, action: "review" },
    { id: "failed_payments", on: true, limit: 4, action: "warn" },
    { id: "promo_abuse", on: false, limit: 8, action: "review" },
    { id: "low_rating", on: true, limit: 4.2, action: "warn" },
  ];
}

export function emptyRiskOps(): RiskOps {
  return { draftRev: 1, rules: { SE: defaultRules(), FR: defaultRules(), TN: defaultRules() }, reviews: [], history: [] };
}

export function normalizeRiskOps(value: unknown): RiskOps {
  const base = emptyRiskOps();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<RiskOps>;
  const rules = { ...base.rules };
  for (const id of Object.keys(base.rules) as MarketId[]) {
    const saved = raw.rules?.[id];
    if (Array.isArray(saved)) rules[id] = base.rules[id].map((rule) => ({ ...rule, ...(saved.find((item) => item.id === rule.id) ?? {}) }));
  }
  return { draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1, rules, reviews: Array.isArray(raw.reviews) ? raw.reviews : [], history: Array.isArray(raw.history) ? raw.history : [] };
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

export type Person = { key: string; id: string; who: Who; name: string; zoneId: string; signals: Partial<Record<RuleId, number>> };

export function signalsOf(record: DemoRecord, who: Who): Partial<Record<RuleId, number>> {
  // Live: no signal is derived from the id; the server's signals are read by the Risk page (owner rule, part 3).
  if (isLiveData() || record.live) return {};
  const seed = hash(`${who}:${record.id}`);
  const signals: Partial<Record<RuleId, number>> = {
    cancels: who === "driver" ? seed % 42 : (seed >>> 3) % 40,
    multi_account: seed % 23 === 0 ? 2 + (seed % 3) : 1,
  };
  if (who === "driver") {
    signals.fake_gps = seed % 17 === 0 ? 2 + (seed % 5) : seed % 11 === 0 ? 1 : 0;
    signals.low_rating = Math.round((3.7 + ((seed >>> 5) % 13) / 10) * 10) / 10;
  } else {
    signals.shared_card = seed % 29 === 0 ? 2 + (seed % 3) : 1;
    signals.failed_payments = (seed >>> 7) % 9 === 0 ? 3 + (seed % 4) : (seed >>> 7) % 3;
    signals.promo_abuse = seed % 31 === 0 ? 8 + (seed % 6) : (seed >>> 2) % 4;
  }
  return signals;
}

export function people(drivers: readonly DemoRecord[], riders: readonly DemoRecord[]): Person[] {
  return [
    ...drivers.map((row) => ({ key: `driver:${row.id}`, id: row.id, who: "driver" as const, name: row.name, zoneId: row.zoneId, signals: signalsOf(row, "driver") })),
    ...riders.map((row) => ({ key: `rider:${row.id}`, id: row.id, who: "rider" as const, name: row.name, zoneId: row.zoneId, signals: signalsOf(row, "rider") })),
  ];
}

export type Hit = { rule: RuleDef; value: number; limit: number; action: RuleAction };
export type Flagged = Person & { hits: Hit[]; score: number; action: RuleAction; review: Review | null };

const WEIGHT: Record<RuleAction, number> = { warn: 15, review: 30, block: 50 };
const RANK: Record<RuleAction, number> = { warn: 0, review: 1, block: 2 };

export function hitsOf(person: Person, rules: readonly Rule[]): Hit[] {
  const hits: Hit[] = [];
  for (const rule of rules) {
    if (!rule.on) continue;
    const def = RULES.find((item) => item.id === rule.id);
    const value = person.signals[rule.id];
    if (!def || value === undefined || !def.who.includes(person.who)) continue;
    const over = def.worse === "up" ? value >= rule.limit : value < rule.limit;
    if (over) hits.push({ rule: def, value, limit: rule.limit, action: rule.action });
  }
  return hits;
}

export function lastReview(ops: RiskOps, key: string): Review | null {
  return ops.reviews.filter((review) => review.key === key).sort((a, b) => a.at.localeCompare(b.at)).at(-1) ?? null;
}

export function flagged(list: readonly Person[], rules: readonly Rule[], ops: RiskOps): Flagged[] {
  return list
    .map((person) => {
      const hits = hitsOf(person, rules);
      const action = hits.reduce<RuleAction>((worst, hit) => (RANK[hit.action] > RANK[worst] ? hit.action : worst), "warn");
      return { ...person, hits, action, score: Math.min(100, hits.reduce((sum, hit) => sum + WEIGHT[hit.action], 0)), review: lastReview(ops, person.key) };
    })
    .filter((person) => person.hits.length > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** How many people each rule would flag, now and with the draft. */
export function preview(list: readonly Person[], saved: readonly Rule[], draft: readonly Rule[], ops: RiskOps): { now: number; after: number; blocked: number; byRule: { id: RuleId; now: number; after: number }[] } {
  const now = flagged(list, saved, ops);
  const after = flagged(list, draft, ops);
  return {
    now: now.length,
    after: after.length,
    blocked: after.filter((person) => person.action === "block").length,
    byRule: RULES.map((rule) => ({ id: rule.id, now: now.filter((person) => person.hits.some((hit) => hit.rule.id === rule.id)).length, after: after.filter((person) => person.hits.some((hit) => hit.rule.id === rule.id)).length })),
  };
}

export function ruleError(rules: readonly Rule[]): string | null {
  for (const rule of rules) {
    const def = RULES.find((item) => item.id === rule.id);
    if (!def) continue;
    if (!Number.isFinite(rule.limit) || rule.limit < def.min || rule.limit > def.max) return `${def.label}: the limit must be ${def.min} to ${def.max} ${def.unit}.`;
  }
  return null;
}

export function ruleChanges(before: readonly Rule[], after: readonly Rule[]): string[] {
  const lines: string[] = [];
  for (const rule of after) {
    const old = before.find((item) => item.id === rule.id);
    const def = RULES.find((item) => item.id === rule.id);
    if (!old || !def) continue;
    if (old.on !== rule.on) lines.push(`${def.label}: ${rule.on ? "on" : "off"}`);
    if (old.limit !== rule.limit) lines.push(`${def.label}: ${old.limit} → ${rule.limit} ${def.unit}`);
    if (old.action !== rule.action) lines.push(`${def.label}: ${old.action} → ${rule.action}`);
  }
  return lines;
}

export function saveRules(ops: RiskOps, country: MarketId, rules: Rule[], by: string, at: string): { ops: RiskOps; error?: string } {
  const error = ruleError(rules);
  if (error) return { ops, error };
  const changes = ruleChanges(ops.rules[country], rules);
  return { ops: { ...ops, draftRev: ops.draftRev + 1, rules: { ...ops.rules, [country]: rules }, history: [...ops.history, { at, by, country, changes }] } };
}

export function review(ops: RiskOps, key: string, decision: Decision, note: string, by: string, at: string): RiskOps {
  return { ...ops, draftRev: ops.draftRev + 1, reviews: [...ops.reviews, { key, decision, note, by, at }] };
}
