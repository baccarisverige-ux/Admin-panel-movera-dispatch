import { zoneDemand } from "./demand.ts";
import { surgeAlerts, zoneSurge, type SurgeAlert, type ZoneSurge } from "./surge.ts";
import { zoneBook, zoneLive, type PricingStore, type ZoneBook, type ZoneLive } from "./zonePricing.ts";

export type LiveCounts = Map<string, { waiting: number; free: number }>;

export type SurgeRow = { book: ZoneBook; live: ZoneLive; surge: ZoneSurge };

/** Surge state for each zone, from the published books, live counts and the demand model. */
export function surgeRows(store: PricingStore, zoneIds: readonly string[], counts: LiveCounts, at: number, drafts: Record<string, ZoneBook> = {}): SurgeRow[] {
  return zoneIds.map((zoneId) => {
    const book = drafts[zoneId] ?? zoneBook(store, zoneId);
    const live = zoneLive(store, zoneId);
    return { book, live, surge: zoneSurge(book, live, zoneDemand(zoneId, at, counts.get(zoneId)), at) };
  });
}

export function alertsFor(rows: readonly SurgeRow[], at: number, changes?: (book: ZoneBook) => number | null): SurgeAlert[] {
  return surgeAlerts(rows, at, changes);
}
