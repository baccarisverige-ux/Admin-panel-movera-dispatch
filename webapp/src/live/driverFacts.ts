import type { DemoRecord, LiveDriverFacts } from "../api/seed.ts";

/**
 * Owner G2c (2026-10-30, "Fix now (Recommended)"): on live the Drivers list and the driver page show only what the
 * server sends. Driver.rating is the rating; the server sends no trip count, cancel rate, acceptance, online hours or
 * earnings per driver yet, so those are null and the page writes "—". Nothing is seeded from the driver id.
 */
export type LiveDriverMonth = {
  rating: number | null;
  trips: number | null;
  cancellationPct: number | null;
  acceptancePct: number | null;
  onlineHours: number | null;
  netMinor: number | null;
};

export const DASH = "—";

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * G3-D2 (owner "Real numbers"): with Driver.performance (GET /admin/drivers/{driverId}, last 30 days) the rating,
 * acceptance % and cancellation % are the server's; null there stays "—" (too few offers, trips or ratings).
 * `performance` overrides what the list row carries (the list has no performance).
 */
export function liveDriverMonth(facts: LiveDriverFacts | null | undefined, performance?: LiveDriverFacts["performance"] | null): LiveDriverMonth {
  const perf = performance ?? facts?.performance ?? null;
  const rating = perf ? num(perf.rating) : num(facts?.rating);
  return { rating, trips: null, cancellationPct: perf ? num(perf.cancellationPct) : null, acceptancePct: perf ? num(perf.acceptancePct) : null, onlineHours: null, netMinor: null };
}

/** A number as text, "—" when the server sent none. */
export function orDash(value: number | null | undefined, write: (value: number) => string = String): string {
  return typeof value === "number" && Number.isFinite(value) ? write(value) : DASH;
}

/** When the driver joined: the server's sign-up time (createdAt), else when the terms were accepted; null when neither. */
export function liveJoinedAt(account: DemoRecord["liveAccount"] | undefined): string | null {
  return account?.createdAt ?? account?.termsAcceptedAt ?? null;
}

/** "now" while the driver is online, the last position time (lastFixAt) otherwise, null when the server has none. */
export function liveLastOnline(facts: LiveDriverFacts | null | undefined, onlineNow: boolean): "now" | string | null {
  if (onlineNow) return "now";
  return facts?.lastFixAt ?? facts?.location?.measuredAt ?? null;
}

/** Whole days since the driver joined, null when the server sent no date (a bonus for new drivers then skips them). */
export function liveJoinedDays(account: DemoRecord["liveAccount"] | undefined, nowMs: number): number | null {
  const at = liveJoinedAt(account);
  const ms = at ? Date.parse(at) : NaN;
  return Number.isFinite(ms) ? Math.max(0, Math.floor((nowMs - ms) / 86_400_000)) : null;
}
