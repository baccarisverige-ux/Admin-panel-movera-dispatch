import type { DemoRecord } from "../api/seed.ts";
import { CATEGORIES } from "../domain/contract.ts";
import { liveDriverOf } from "../live/realData.ts";
import type { DriverInfo } from "./DriverPanel.tsx";

/**
 * A15 (rule 36, proven 2026-11-05): live, the live-map driver panel reads only what the server sent
 * (Driver.rating, Driver.performance, Driver.categoryIds on the /admin/drivers record). A value the server does
 * not send is null and shows "—". It never calls driverOps / driverPerformance (those make numbers from the id).
 */
export function liveDriverInfo(record: DemoRecord, context: { fleet: string | null; account: string }): DriverInfo {
  const facts = liveDriverOf(record);
  const performance = facts?.performance ?? null;
  const allowed = liveAllowedCategories(record);
  return {
    phone: record.phone ?? "",
    account: context.account,
    rating: performance?.rating ?? facts?.rating ?? null,
    fleet: context.fleet,
    // The server sends no "today" totals for one driver yet (L-a): shown as "—".
    todayTrips: null,
    todayNet: null,
    onlineHours: null,
    acceptancePct: performance?.acceptancePct ?? null,
    cancellationPct: performance?.cancellationPct ?? null,
    categories: CATEGORIES.filter((category) => allowed.includes(category.id)).map((category) => category.label),
  };
}

/** Live: the categories the server allows this driver (Driver.categoryIds). No record or none sent → none. */
export function liveAllowedCategories(record: Pick<DemoRecord, "liveAccount"> | null | undefined): string[] {
  return [...(record?.liveAccount?.categoryIds ?? [])];
}

const dash = (value: number | null, digits?: number) => (value === null ? "—" : digits === undefined ? String(value) : value.toFixed(digits));

/** The texts the panel shows (null categories → "No category allowed"). Kept pure so tests can read them. */
export function driverPanelText(info: DriverInfo) {
  return {
    rating: dash(info.rating, 2),
    rates: info.acceptancePct === null && info.cancellationPct === null ? "— · —" : `${info.acceptancePct === null ? "—" : `${info.acceptancePct}%`} · ${info.cancellationPct === null ? "—" : `${info.cancellationPct}%`}`,
    today: info.todayTrips === null || info.todayNet === null ? "—" : null,
    online: dash(info.onlineHours),
    categories: info.categories.length ? info.categories : null,
  };
}
