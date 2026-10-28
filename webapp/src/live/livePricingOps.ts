/**
 * Contract v0.7.1 (owner Pricing decisions 2026-10-27), admin side of the live Pricing section: the demo's own
 * controls, wired to the server.
 *  - Manage categories: one catalog for every zone (GET|POST /admin/categories, PUT …/{id}, …/archive, …/restore),
 *    with the sub-line in sv / fr / en.
 *  - Manual surge Start / Stop (PUT /admin/zones/{zoneId}/surge, POST …/end). v0.7.2 (owner 2026-10-28): no
 *    "Tell drivers now" and no surge notice (POST …/surge/notify is gone, contract.json#surgeNoticeRemoved).
 *  - History, Restore and Undo last publish (GET /admin/config/pricing/history, POST …/restore).
 * Pure over a ConfigHttp, so node --test covers them.
 */
import type { CategoryDef, ManualSurge, PricingStore, Revision, ZoneLive } from "../pricing/zonePricing.ts";
import { zoneBook } from "../pricing/zonePricing.ts";
import { zoneById } from "../markets/markets.ts";
import { bookOfPricing, type ConfigHttp, type Doc } from "./configDocs.ts";

type Lines = { sv: string; fr: string; en: string };
export type ServerCategory = { id: string; label: string; line: Lines; seats: number; builtIn: boolean; sort: number; archivedAt?: string; archivedBy?: string; archiveReason?: string };
type Schedule = { scheduleId: string; zoneId: string; startAt: string; endAt: string; cap: number; points: Array<{ atMin: number; multiplier: number }>; status: string; version: number; createdBy?: string };
type HistoryEntry = { zoneId: string; version: number; publishedAt: string; publishedBy?: string; note?: string; action: "publish" | "restore"; restoredFrom?: number; document: Doc };

/** The server's catalog as the demo's categories: label, English line, the sv / fr / en lines, seats, archived. */
export function categoriesOf(list: readonly ServerCategory[]): CategoryDef[] {
  return list.map((item) => ({
    id: item.id,
    label: item.label,
    line: item.line.en || item.line.sv || item.line.fr,
    lines: { sv: item.line.sv, fr: item.line.fr, en: item.line.en },
    seats: item.seats,
    builtIn: item.builtIn,
    archived: item.archivedAt ? { at: item.archivedAt, by: item.archivedBy ?? "", reason: item.archiveReason ?? "" } : null,
  }));
}

const linesOf = (category: CategoryDef): Lines => category.lines ?? { sv: category.line, fr: category.line, en: category.line };

/** A running manual surge from the server's schedule, as the demo shows it (its peak is the multiplier). */
export function manualOf(schedule: Schedule | null): ManualSurge | null {
  if (!schedule || schedule.status === "ended" || schedule.status === "cancelled") return null;
  const peak = Math.max(...schedule.points.map((point) => point.multiplier));
  const flat = schedule.points.every((point) => point.multiplier === peak);
  return {
    multiplier: peak,
    startedAt: schedule.startAt,
    endsAt: schedule.endAt,
    by: schedule.createdBy ?? "",
    reason: "",
    ...(flat ? {} : { curve: { startAt: schedule.startAt, endAt: schedule.endAt, points: schedule.points.map((point) => ({ atMin: point.atMin, multiplier: point.multiplier })) } }),
  };
}

/** The schedule a demo manual surge asks the server for: a flat or curved surge from now to its end. */
export function scheduleOf(manual: ManualSurge, expectedVersion: number): Doc {
  const minutes = Math.max(5, Math.round((Date.parse(manual.endsAt) - Date.parse(manual.startedAt)) / 60_000));
  const curve = manual.curve?.points;
  const points = curve?.length ? curve.map((point) => ({ atMin: point.atMin, multiplier: point.multiplier })) : [{ atMin: 0, multiplier: manual.multiplier }, { atMin: minutes, multiplier: manual.multiplier }];
  return { expectedVersion, startAt: manual.startedAt, endAt: manual.endsAt, stepMinutes: 5, points, ...(manual.reason ? { note: manual.reason } : {}) };
}

/** Where each history row of the page came from on the server. */
export type HistoryIndex = Map<number, { zoneId: string; version: number; liveVersion: number }>;

/** The server's per-zone history as the demo's revisions, newest first (rev counts down to 1). */
export function revisionsOf(entries: readonly HistoryEntry[], store: PricingStore, liveVersions: Record<string, number>): { history: Revision[]; index: HistoryIndex } {
  const sorted = [...entries].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.version - a.version);
  const index: HistoryIndex = new Map();
  const history = sorted.map((entry, i) => {
    const rev = sorted.length - i;
    index.set(rev, { zoneId: entry.zoneId, version: entry.version, liveVersion: liveVersions[entry.zoneId] ?? entry.version });
    const reason = entry.action === "restore" ? `Restore version ${entry.restoredFrom ?? "?"}` : entry.note ?? "Pricing update";
    return {
      rev,
      at: entry.publishedAt,
      actorId: entry.publishedBy ?? "",
      reason,
      zoneIds: [entry.zoneId],
      changes: [`${zoneById(entry.zoneId)?.name ?? entry.zoneId} · version ${entry.version}${entry.restoredFrom ? ` (= version ${entry.restoredFrom})` : ""}`],
      books: { [entry.zoneId]: bookOfPricing(entry.document, zoneBook(store, entry.zoneId)) },
    };
  });
  return { history, index };
}

const quiet = async <T,>(call: Promise<T>): Promise<T | null> => {
  try {
    return await call;
  } catch {
    return null;
  }
};

/** Reads the catalog, the running surges and the history into the store; anything the server lacks stays the demo's. */
export async function readPricingExtras(http: ConfigHttp, store: PricingStore, zoneIds: readonly string[]): Promise<{ store: PricingStore; index: HistoryIndex; surgeVersions: Record<string, number> }> {
  const next: PricingStore = { ...store, live: { ...store.live } };
  const catalog = await quiet(http.json<{ categories: ServerCategory[] }>("/admin/categories"));
  if (catalog?.categories?.length) next.categories = categoriesOf(catalog.categories);
  const surgeVersions: Record<string, number> = {};
  const entries: HistoryEntry[] = [];
  const liveVersions: Record<string, number> = {};
  await Promise.all(
    zoneIds.map(async (zoneId) => {
      const schedule = await quiet(http.json<Schedule>(`/admin/zones/${encodeURIComponent(zoneId)}/surge`));
      const manual = manualOf(schedule && typeof schedule === "object" && "scheduleId" in schedule ? schedule : null);
      if (schedule && typeof schedule === "object" && "version" in schedule) surgeVersions[zoneId] = manual ? schedule.version : 0;
      next.live[zoneId] = { manual } satisfies ZoneLive;
      const page = await quiet(http.json<{ items: HistoryEntry[] }>(`/admin/config/pricing/history?zoneId=${encodeURIComponent(zoneId)}&limit=20`));
      if (page?.items?.length) {
        entries.push(...page.items.map((item) => ({ ...item, zoneId })));
        liveVersions[zoneId] = Math.max(...page.items.map((item) => item.version));
      }
    }),
  );
  const { history, index } = revisionsOf(entries, next, liveVersions);
  if (history.length) next.history = history;
  return { store: next, index, surgeVersions };
}

/** What changed in the catalog between the page's store and the one a command asks for. */
export function catalogChanges(before: readonly CategoryDef[], after: readonly CategoryDef[]): Array<{ kind: "create" | "edit" | "archive" | "restore"; category: CategoryDef }> {
  const out: Array<{ kind: "create" | "edit" | "archive" | "restore"; category: CategoryDef }> = [];
  for (const category of after) {
    const old = before.find((item) => item.id === category.id);
    if (!old) out.push({ kind: "create", category });
    else if (!old.archived && category.archived) out.push({ kind: "archive", category });
    else if (old.archived && !category.archived) out.push({ kind: "restore", category });
    else if (old.label !== category.label || old.seats !== category.seats || JSON.stringify(linesOf(old)) !== JSON.stringify(linesOf(category))) out.push({ kind: "edit", category });
  }
  return out;
}

/** Sends catalog changes to the server, in order. */
export async function sendCatalog(http: ConfigHttp, changes: ReturnType<typeof catalogChanges>): Promise<void> {
  for (const { kind, category } of changes) {
    const id = encodeURIComponent(category.id);
    const body = { label: category.label, line: linesOf(category), seats: category.seats };
    if (kind === "create") await http.post("/admin/categories", { ...body, id: category.id });
    else if (kind === "edit") await http.put(`/admin/categories/${id}`, body);
    else if (kind === "archive") await http.post(`/admin/categories/${id}/archive`, { reason: category.archived?.reason || "Deleted in Pricing" });
    else await http.post(`/admin/categories/${id}/restore`, {});
  }
}

/** Manual surges that start or stop between two stores (per zone). */
export function surgeChanges(before: PricingStore, after: PricingStore): Array<{ zoneId: string; manual: ManualSurge | null }> {
  const zones = new Set([...Object.keys(before.live), ...Object.keys(after.live)]);
  const out: Array<{ zoneId: string; manual: ManualSurge | null }> = [];
  for (const zoneId of zones) {
    const was = before.live[zoneId]?.manual ?? null;
    const now = after.live[zoneId]?.manual ?? null;
    if (JSON.stringify(was) !== JSON.stringify(now)) out.push({ zoneId, manual: now });
  }
  return out;
}
