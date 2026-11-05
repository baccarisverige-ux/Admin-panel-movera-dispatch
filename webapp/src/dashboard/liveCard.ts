import type { DemoRecord } from "../api/seed.ts";

/**
 * Contract v0.18.34 §65 (Rules A8/A10, proven cause): the Dashboard's live card, live map and "Drivers online now"
 * tile. They read every page of GET /admin/live/drivers ("liveDrivers") and nothing else decides who is shown; the
 * driver list (first page only) just adds details when it has loaded. Kept apart from DashboardPage to be tested.
 */
export const LIVE_CARD_LIST = "liveDrivers";

/** Card rows: one per live driver; a driver-list row with the same id adds its details, the live facts stay. */
export function liveCardRows(presence: readonly DemoRecord[] | undefined, details?: readonly DemoRecord[]): DemoRecord[] {
  const byId = new Map((details ?? []).map((row) => [row.id, row]));
  return (presence ?? []).map((row) => {
    const detail = byId.get(row.id);
    return detail ? { ...detail, zoneId: row.zoneId || detail.zoneId, ...(row.liveDriver ? { liveDriver: { ...detail.liveDriver, ...row.liveDriver } } : {}) } : row;
  });
}

export const LOADING = "…";
export const RETRYING = "Could not load, retrying";

/** The "Drivers online now" value: "…" while loading, the retry text on a failed read, never a false 0. */
export function onlineTileValue(query: { isLoading: boolean; error: unknown }, count: number, format: (value: number) => string): string {
  if (query.error) return RETRYING;
  if (query.isLoading) return LOADING;
  return format(count);
}
