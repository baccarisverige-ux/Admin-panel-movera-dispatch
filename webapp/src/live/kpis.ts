/**
 * Live KPIs (contract v0.9.0 §16, GET /admin/kpis): today counted live by the server, earlier days from the nightly
 * summary. A total is only shown when every day of the period is there; a missing day (not summarized yet) makes it
 * "Not connected yet" (NaN), never a smaller number. Tips, refunds and pickup wait are not in the summary (NaN).
 */
import type { EarningsReport, Totals } from "../dashboard/earnings.ts";
import type { PeriodWindow } from "../dashboard/period.ts";
import type { KpiDay } from "./types.ts";
import { zoneById } from "../markets/markets.ts";

/** The zone-local day of a moment, YYYY-MM-DD. */
export function localDay(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** Every zone-local day from the start of the window to its end (the end itself excluded at midnight). */
export function daysOf(start: number, end: number, timeZone: string): string[] {
  const first = localDay(start, timeZone);
  const last = localDay(Math.max(start, end - 1), timeZone);
  const out: string[] = [];
  for (let day = first; day <= last; ) {
    out.push(day);
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  return out;
}

const NONE = NaN;

/** Sums the days of the zones; NaN for a total when a zone-day is missing. */
export function totalsOf(days: readonly KpiDay[], zoneIds: readonly string[], dates: readonly string[]): Totals {
  const have = new Set(days.map((day) => `${day.zoneId}|${day.date}`));
  const complete = zoneIds.length > 0 && dates.length > 0 && zoneIds.every((zone) => dates.every((date) => have.has(`${zone}|${date}`)));
  const wanted = days.filter((day) => zoneIds.includes(day.zoneId) && dates.includes(day.date));
  const sum = (pick: (day: KpiDay) => number) => (complete ? wanted.reduce((total, day) => total + pick(day), 0) : NONE);
  const commission = sum((day) => day.commission);
  return {
    trips: sum((day) => day.completedTrips),
    cancelled: sum((day) => day.cancelledTrips + day.noShows),
    grossMinor: sum((day) => day.gross),
    commissionMinor: commission,
    driverMinor: sum((day) => day.driverEarnings + day.pickupPay + day.driverBonus),
    tipsMinor: NONE,
    refundsMinor: NONE,
    netMinor: NONE,
    newRiders: sum((day) => day.newRiders),
    newDrivers: sum((day) => day.newDrivers),
    waitMinTotal: NONE,
  };
}

/** The dashboard's report from the server's days: totals, the previous period and one point a day. */
export function kpiReport(days: readonly KpiDay[], zoneIds: readonly string[], window: PeriodWindow, timeZone: string, locale: string): EarningsReport {
  const current = daysOf(window.start, window.end, timeZone);
  const previous = daysOf(window.prevStart, window.prevEnd, timeZone);
  const label = new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short" });
  const series = current.map((date) => {
    const one = totalsOf(days, zoneIds, [date]);
    return { at: Date.parse(`${date}T12:00:00Z`), label: label.format(new Date(`${date}T12:00:00Z`)), current: one.grossMinor, previous: null };
  });
  const byZone = zoneIds.map((id) => ({ id, label: zoneById(id)?.name ?? id, minor: totalsOf(days, [id], current).grossMinor })).filter((row) => Number.isFinite(row.minor)).sort((a, b) => b.minor - a.minor);
  return { totals: totalsOf(days, zoneIds, current), previous: totalsOf(days, zoneIds, previous), series, byZone, byCategory: [], byMethod: [] };
}
