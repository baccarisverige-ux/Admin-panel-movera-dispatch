import { market, type MarketId } from "../markets/markets.ts";
import { bucketLabel, bucketStarts, type PeriodWindow } from "./period.ts";
import { localParts } from "./time.ts";
import { isLiveData } from "../live/realData.ts";

/**
 * Demo earnings: a deterministic hourly model per zone, so every period (today → a year)
 * has realistic, repeatable numbers. A live backend would serve the same shape from its ledger.
 */

/** Placeholder until the commission rate is confirmed (it is still listed under "To confirm"). */
export const COMMISSION_PLACEHOLDER = 0.2;

export type Totals = {
  trips: number;
  cancelled: number;
  grossMinor: number;
  commissionMinor: number;
  driverMinor: number;
  tipsMinor: number;
  refundsMinor: number;
  netMinor: number;
  newRiders: number;
  newDrivers: number;
  waitMinTotal: number;
};

export type SeriesPoint = { at: number; label: string; current: number; previous: number | null };
export type Share = { id: string; label: string; minor: number };

export type EarningsReport = {
  totals: Totals;
  previous: Totals;
  series: SeriesPoint[];
  byZone: Share[];
  byCategory: Share[];
  byMethod: Share[];
};

const MODEL: Record<MarketId, { peakTrips: number; fareMinor: number; airportFare: number }> = {
  SE: { peakTrips: 26, fareMinor: 26_000, airportFare: 2.4 },
  FR: { peakTrips: 38, fareMinor: 2_400, airportFare: 2.6 },
  TN: { peakTrips: 22, fareMinor: 14_000, airportFare: 2.1 },
};

/** Share of trips by local hour (Mon–Thu shape; weekends lift the late evening). */
export const HOURLY = [0.22, 0.14, 0.09, 0.07, 0.08, 0.18, 0.42, 0.78, 0.92, 0.66, 0.52, 0.55, 0.6, 0.56, 0.54, 0.62, 0.8, 0.96, 1, 0.84, 0.66, 0.56, 0.48, 0.34];
export const WEEKDAY = [0.92, 0.94, 0.97, 1.02, 1.14, 1.08, 0.86];
export const NIGHT_LIFT = [1, 1, 1, 1, 1.3, 1.55, 1.2];

const CATEGORY_SHARE: [string, string, number][] = [
  ["economy", "Movera", 0.46],
  ["comfort", "Comfort", 0.2],
  ["premium", "Premium", 0.1],
  ["electric", "Electric", 0.09],
  ["xl", "XL", 0.08],
  ["priority", "Priority", 0.04],
  ["pet", "Pet", 0.03],
];

const METHOD_SHARE: Record<MarketId, [string, string, number][]> = {
  SE: [["card", "Card", 0.55], ["apple", "Apple Pay", 0.22], ["google", "Google Pay", 0.1], ["wallet", "Wallet", 0.07], ["cash", "Cash", 0.06]],
  FR: [["card", "Card", 0.58], ["apple", "Apple Pay", 0.22], ["google", "Google Pay", 0.12], ["wallet", "Wallet", 0.05], ["cash", "Cash", 0.03]],
  TN: [["cash", "Cash", 0.48], ["card", "Card", 0.35], ["wallet", "Wallet", 0.17]],
};

function noise(seed: number): number {
  let value = Math.imul(seed ^ 0x5bd1e995, 0x27d4eb2d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x165667b1);
  return ((value >>> 0) % 10_000) / 10_000;
}

function zoneSeed(zoneId: string): number {
  let hash = 2166136261;
  for (const char of zoneId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function emptyTotals(): Totals {
  return { trips: 0, cancelled: 0, grossMinor: 0, commissionMinor: 0, driverMinor: 0, tipsMinor: 0, refundsMinor: 0, netMinor: 0, newRiders: 0, newDrivers: 0, waitMinTotal: 0 };
}

type Hour = { trips: number; gross: number; cancelled: number; wait: number };

const clock = new Map<string, { hour: number; weekday: number }>();

function localHour(at: number, timeZone: string): { hour: number; weekday: number } {
  const key = `${timeZone}:${Math.floor(at / 3_600_000)}`;
  let found = clock.get(key);
  if (!found) {
    const parts = localParts(at, timeZone);
    found = { hour: parts.hour, weekday: parts.weekday };
    if (clock.size > 50_000) clock.clear();
    clock.set(key, found);
  }
  return found;
}

const hours = new Map<string, Hour>();

/** Each zone-hour is computed once; switching periods back and forth reuses them. */
function hourModel(id: MarketId, zoneId: string, kind: "operating" | "airport", at: number): Hour {
  const key = `${zoneId}:${Math.floor(at / 3_600_000)}`;
  const cached = hours.get(key);
  if (cached) return cached;
  if (hours.size > 400_000) hours.clear();
  const hour = computeHour(id, zoneId, kind, at);
  hours.set(key, hour);
  return hour;
}

function computeHour(id: MarketId, zoneId: string, kind: "operating" | "airport", at: number): Hour {
  const model = MODEL[id];
  const local = localHour(at, market(id).timeZone);
  const seed = zoneSeed(zoneId);
  const hourIndex = Math.floor(at / 3_600_000);
  const zoneWeight = kind === "airport" ? 0.35 : 0.55 + (seed % 90) / 100;
  const lift = local.hour >= 21 || local.hour <= 2 ? NIGHT_LIFT[local.weekday] : 1;
  const growth = 1 + 0.28 * Math.min(1, Math.max(-1, (at - Date.UTC(2026, 0, 1)) / (365 * 86_400_000)));
  const jitter = 0.82 + 0.36 * noise(seed + hourIndex);
  const trips = model.peakTrips * zoneWeight * HOURLY[local.hour] * WEEKDAY[local.weekday] * lift * growth * jitter;
  const fare = model.fareMinor * (kind === "airport" ? model.airportFare : 1) * (0.92 + 0.16 * noise(seed * 3 + hourIndex));
  return { trips, gross: trips * fare, cancelled: trips * (0.05 + 0.05 * noise(seed * 7 + hourIndex)), wait: trips * (3.2 + 3.4 * HOURLY[local.hour] * noise(seed * 11 + hourIndex)) };
}

function addHour(totals: Totals, hour: Hour, seed: number): void {
  const tips = hour.gross * (0.035 + 0.02 * noise(seed));
  const refunds = hour.gross * (0.012 + 0.012 * noise(seed + 1));
  const commission = hour.gross * COMMISSION_PLACEHOLDER;
  totals.trips += hour.trips;
  totals.cancelled += hour.cancelled;
  totals.grossMinor += hour.gross;
  totals.commissionMinor += commission;
  totals.driverMinor += hour.gross - commission + tips;
  totals.tipsMinor += tips;
  totals.refundsMinor += refunds;
  totals.netMinor += commission - refunds;
  totals.newRiders += hour.trips * 0.045;
  totals.newDrivers += hour.trips * 0.004;
  totals.waitMinTotal += hour.wait;
}

function roundTotals(totals: Totals): Totals {
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value)])) as Totals;
}

function sumRange(id: MarketId, zones: readonly string[], start: number, end: number, perZone?: Map<string, number>): Totals {
  const totals = emptyTotals();
  const info = market(id).zones.filter((zone) => zones.includes(zone.id));
  const first = Math.floor(start / 3_600_000) * 3_600_000;
  for (let at = first; at < end; at += 3_600_000) {
    const fraction = Math.min(1, (end - at) / 3_600_000) - Math.max(0, (start - at) / 3_600_000);
    if (fraction <= 0) continue;
    for (const zone of info) {
      const hour = hourModel(id, zone.id, zone.kind, at);
      const scaled = { trips: hour.trips * fraction, gross: hour.gross * fraction, cancelled: hour.cancelled * fraction, wait: hour.wait * fraction };
      addHour(totals, scaled, zoneSeed(zone.id) + Math.floor(at / 3_600_000));
      if (perZone) perZone.set(zone.id, (perZone.get(zone.id) ?? 0) + scaled.gross);
    }
  }
  return totals;
}

function shares(rows: [string, string, number][], totalMinor: number): Share[] {
  return rows.map(([id, label, share]) => ({ id, label, minor: Math.round(totalMinor * share) }));
}

/** Live: every total is NaN ("Not connected yet") until the server's KPI summary is read; no modelled numbers. */
export function notConnectedReport(): EarningsReport {
  const none = Object.fromEntries(Object.keys(emptyTotals()).map((key) => [key, NaN])) as Totals;
  return { totals: none, previous: { ...none }, series: [], byZone: [], byCategory: [], byMethod: [] };
}

export function earningsReport(id: MarketId, zones: readonly string[], window: PeriodWindow, locale = market(id).locale): EarningsReport {
  if (isLiveData()) return notConnectedReport();
  const { timeZone } = market(id);
  const perZone = new Map<string, number>();
  const starts = bucketStarts(window.start, window.spanEnd, window.bucket, timeZone);
  const prevStarts = bucketStarts(window.prevStart, window.prevStart + (window.spanEnd - window.start), window.bucket, timeZone);
  const totals = emptyTotals();
  const series: SeriesPoint[] = starts.map((at, index) => {
    const next = starts[index + 1] ?? window.spanEnd;
    const current = at < window.end ? sumRange(id, zones, at, Math.min(next, window.end), perZone) : null;
    if (current) for (const key of Object.keys(totals) as (keyof Totals)[]) totals[key] += current[key];
    const prevAt = prevStarts[index];
    const prevNext = prevStarts[index + 1] ?? window.prevStart + (next - window.start);
    const previous = prevAt === undefined ? null : sumRange(id, zones, prevAt, prevNext).grossMinor;
    return { at, label: bucketLabel(at, window.bucket, timeZone, locale), current: current ? Math.round(current.grossMinor) : NaN, previous: previous === null ? null : Math.round(previous) };
  });
  const previous = sumRange(id, zones, window.prevStart, window.prevEnd);
  const zoneNames = new Map(market(id).zones.map((zone) => [zone.id, zone.name]));
  const byZone = Array.from(perZone, ([zoneId, minor]) => ({ id: zoneId, label: zoneNames.get(zoneId) ?? zoneId, minor: Math.round(minor) }))
    .sort((a, b) => b.minor - a.minor);
  const final = roundTotals(totals);
  return {
    totals: final,
    previous: roundTotals(previous),
    series,
    byZone,
    byCategory: shares(CATEGORY_SHARE, final.grossMinor),
    byMethod: shares(METHOD_SHARE[id], final.grossMinor),
  };
}

/** Percentage change from `before` to `now`, or null when there is nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (!before) return null;
  return ((now - before) / before) * 100;
}
