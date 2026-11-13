/**
 * The list readers of createLiveAdminApi (moved here unchanged, S5 J2 / item 111; all() and paged() are in
 * listPages.ts): drivers, riders, who is online now (GET /admin/live/drivers pages) and payouts. They fill the
 * driver / rider / presence maps the api passes in.
 */
import type { DemoRecord } from "../api/seed.ts";
import type { LiveClient } from "./session.ts";
import type { Driver, LiveDriverList, LiveDriverRow, LiveMoney, Rider } from "./types.ts";
import { NO_FILTER, type ZoneFilter } from "./zoneFilter.ts";
import { all, paged } from "./listPages.ts";

/** C7 (A15 N12): the Dashboard count of not-yet-paid payouts, filtered by the server's status. */
export const DUE_PAYOUTS_LIST = "duePayouts";
const DUE_PAYOUT_STATUSES = ["pending", "pending_approval", "failed", "held"] as const;

/** v0.18.34 §65: the live card reads pages of this size, up to LIVE_MAX_PAGES (rule 33: more than 10,000 drivers). */
export const LIVE_PAGE = 500;
const LIVE_MAX_PAGES = 60;

/** The readers, with the api's own maps (each read keeps the rows it found there, as before the move). */
export function createListReaders(client: LiveClient, drivers: Map<string, Driver>, riders: Map<string, Rider>, presence: Map<string, LiveDriverRow>) {
  async function readDrivers(own = false, filter: ZoneFilter = NO_FILTER, signal?: AbortSignal): Promise<Driver[]> {
    const rows = own ? await paged<Driver>(client, "drivers", "/admin/drivers", filter, signal) : await all<Driver>(client, "/admin/drivers");
    rows.forEach((row) => drivers.set(row.driverId, row));
    return rows;
  }

  async function readRiders(own = false, filter: ZoneFilter = NO_FILTER): Promise<Rider[]> {
    const rows = own ? await paged<Rider>(client, "riders", "/admin/riders", filter) : await all<Rider>(client, "/admin/riders");
    rows.forEach((row) => riders.set(row.riderId, row));
    return rows;
  }

  /** GET /admin/live/drivers: who is online now, with the last position (drivers not offline). */
  async function readPresence(filter: ZoneFilter = NO_FILTER, signal?: AbortSignal): Promise<void> {
    const rows = await readLivePages(filter, signal);
    presence.clear();
    rows.forEach((row) => presence.set(row.driverId, row));
  }

  /** v0.18.34 §65 (A8/A10): every page of GET /admin/live/drivers (limit LIVE_PAGE, cursor) — who is online now. */
  async function readLivePages(filter: ZoneFilter, signal?: AbortSignal): Promise<LiveDriverRow[]> {
    const rows: LiveDriverRow[] = [];
    let cursor: string | null = null;
    for (let index = 0; index < LIVE_MAX_PAGES; index += 1) {
      const params = new URLSearchParams([...filter.params, ["limit", String(LIVE_PAGE)], ...(cursor ? [["cursor", cursor] as [string, string]] : [])]);
      const answer: LiveDriverList = await client.json<LiveDriverList>(`/admin/live/drivers?${params.toString()}`, signal ? { signal } : {});
      rows.push(...answer.items);
      cursor = answer.nextCursor ?? null;
      if (!cursor) break;
    }
    return rows;
  }

  /** The Payouts list and the Dashboard's not-yet-paid payouts (DUE_PAYOUTS_LIST). */
  async function readPayouts(name: string, filter: ZoneFilter): Promise<DemoRecord[]> {
    const statuses: [string, string][] = name === DUE_PAYOUTS_LIST ? DUE_PAYOUT_STATUSES.map((status) => ["status", status]) : [];
    const rows = await all<{ payoutId: string; driverId: string; driverName?: string; zoneId?: string; amount: LiveMoney; status: string; periodStart: string; periodEnd: string; source: string; tripCount: number; lines?: { code: string; amount: LiveMoney; count?: number }[]; createdAt: string }>(client, "/admin/payouts", filter, statuses);
    return rows.map((row) => ({
      id: row.payoutId, name: `${row.periodStart.slice(0, 10)} – ${row.periodEnd.slice(0, 10)}`, phone: "", zoneId: row.zoneId ?? "", status: row.status === "paid" ? "paid" : "scheduled", driverId: row.driverId, fareOre: row.amount.amountMinor, createdAt: row.createdAt, live: true,
      livePayout: { lines: (row.lines ?? []).map((line) => ({ code: line.code, amountMinor: line.amount.amountMinor, ...(line.count !== undefined ? { count: line.count } : {}) })), source: row.source, periodStart: row.periodStart, periodEnd: row.periodEnd, tripCount: row.tripCount, currency: row.amount.currency },
    }));
  }

  return { readDrivers, readRiders, readPresence, readLivePages, readPayouts };
}
