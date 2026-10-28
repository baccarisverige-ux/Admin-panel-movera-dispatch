/**
 * Contract v0.7.2 (owner 2026-10-28, contract.json#surgeLive): the live Pricing › Surge tab shows only the server's
 * numbers, in the demo's boxes.
 *  - Surge now per zone (map, zone list, "Surge now" card, alerts): GET /admin/surge/now.
 *  - Demand chart, rider price check, surge timeline and effect: GET /admin/zones/{zoneId}/surge/history.
 * Nothing here is invented: a zone the server does not answer for is left out, and a zone without a sample yet has
 * `demandKnown: false` (the page shows "Not connected yet" there). Pure, so node --test covers it.
 */
import { marketOfZone, zoneById } from "../markets/markets.ts";
import { tr } from "../i18n/core.ts";
import type { DemandPoint } from "../pricing/demand.ts";
import type { SurgeRow } from "../pricing/rows.ts";
import { activeProfile, inActiveHours, surgeLevel, type SurgeSource, type TimelineItem, type ZoneSurge } from "../pricing/surge.ts";
import { zoneBook, zoneLive, type PricingStore, type ZoneBook, type ZoneLive } from "../pricing/zonePricing.ts";

/** ZoneSurgeNow (contract.json#surgeLive.now). */
export type ZoneSurgeNow = {
  zoneId: string;
  multiplier: number;
  source: SurgeSource;
  until?: string;
  scheduleId?: string;
  profileId?: string;
  requests: number;
  freeDrivers: number;
  ratio: number;
  /** The newest sample's time; missing while the server has no sample for the zone. */
  checkedAt?: string;
};
export type SurgeNowAnswer = { at: string; zones: ZoneSurgeNow[] };

export type SurgePoint = { at: string; requests: number; freeDrivers: number; ratio: number; multiplier: number };
export type PriceCheck = { windowMin: number; saw: number; left: number; leftPct: number };
export type SurgeTimelineKind = "manual_start" | "manual_stop" | "scheduled_start" | "scheduled_end" | "smart_change" | "smart_end";
export type SurgeTimelineEntry = {
  at: string;
  kind: SurgeTimelineKind;
  multiplier: number;
  previous?: number;
  by?: string;
  profileId?: string;
  effect?: { drivers: number; ridesPct: number; leftPct: number };
};
export type SurgeHistory = { zoneId: string; from: string; to: string; bucketMin: number; points: SurgePoint[]; priceCheck: PriceCheck; timeline: SurgeTimelineEntry[] };

/** The timeline box says "Last 8 hours" and the chart "Last 6 hours": one call for 8 hours, the chart keeps 6. */
export const HISTORY_HOURS = 8;
export const CHART_HOURS = 6;
export const BUCKET_MIN = 10;

export function surgeNowPath(zoneIds: readonly string[]): string {
  return `/admin/surge/now?zoneIds=${zoneIds.map(encodeURIComponent).join(",")}`;
}

export function surgeHistoryPath(zoneId: string): string {
  return `/admin/zones/${encodeURIComponent(zoneId)}/surge/history?hours=${HISTORY_HOURS}&bucketMin=${BUCKET_MIN}`;
}

const SOURCES: readonly SurgeSource[] = ["manual", "scheduled", "smart", "off"];

/** One zone's surge from the server's answer, in the demo's shape (its colours, labels and notes). */
export function liveZoneSurge(book: ZoneBook, now: ZoneSurgeNow, at: number): ZoneSurge {
  const zone = zoneById(book.zoneId);
  const timeZone = marketOfZone(book.zoneId)?.timeZone ?? "Europe/Stockholm";
  const source: SurgeSource = SOURCES.includes(now.source) ? now.source : "off";
  const multiplier = source === "off" ? 1 : now.multiplier;
  const profile = book.smart.profiles.find((item) => item.id === now.profileId) ?? activeProfile(book.smart, at, timeZone);
  // What the zone's own settings say (smart surge off, outside its hours); never a number.
  const settingsNote = !book.smart.enabled ? "Smart surge is off" : !inActiveHours(book.smart, at, timeZone) ? "Outside smart surge hours" : null;
  const smartNote = source === "manual" ? "Paused while the manual surge runs" : source === "scheduled" ? "Paused while the scheduled surge runs" : source === "smart" ? null : settingsNote;
  const scheduled = source === "scheduled" ? book.scheduled.find((item) => Date.parse(item.startsAt) <= at && Date.parse(item.endsAt) > at) : undefined;
  const demandKnown = Boolean(now.checkedAt);
  return {
    zoneId: book.zoneId,
    name: zone?.name ?? book.zoneId,
    center: zone?.center ?? [0, 0],
    airport: zone?.kind === "airport",
    multiplier,
    source,
    level: surgeLevel(multiplier),
    profile,
    smartNote,
    ratio: demandKnown ? now.ratio : 0,
    requests: demandKnown ? now.requests : 0,
    free: demandKnown ? now.freeDrivers : 0,
    endsAt: source === "manual" || source === "scheduled" ? now.until ?? scheduled?.endsAt ?? null : null,
    scheduledName: scheduled?.name || null,
    demandKnown,
  };
}

/** The Surge tab's rows from GET /admin/surge/now: only the zones the server answered for, in the page's order. */
export function liveSurgeRows(store: PricingStore, zoneIds: readonly string[], answer: SurgeNowAnswer | null | undefined, at: number): SurgeRow[] {
  if (!answer) return [];
  const byZone = new Map(answer.zones.map((item) => [item.zoneId, item]));
  return zoneIds.flatMap((zoneId) => {
    const now = byZone.get(zoneId);
    if (!now) return [];
    const book = zoneBook(store, zoneId);
    const live: ZoneLive = zoneLive(store, zoneId);
    return [{ book, live, surge: liveZoneSurge(book, now, at) }];
  });
}

/** The demand chart's points (the last 6 hours, oldest first) and the surge band, from the history's points. */
export function liveDemand(history: SurgeHistory, at: number): { points: DemandPoint[]; surge: number[] } {
  const from = at - CHART_HOURS * 3_600_000;
  const kept = history.points.map((point) => ({ ...point, time: Date.parse(point.at) })).filter((point) => Number.isFinite(point.time) && point.time >= from).sort((a, b) => a.time - b.time);
  return {
    points: kept.map((point) => ({ at: point.time, requests: point.requests, free: point.freeDrivers, ratio: point.ratio })),
    surge: kept.map((point) => point.multiplier),
  };
}

/** Smart surge level changes in the last hour, from the timeline (the demo's "goes up and down too often" alert). */
export function smartChangesLastHour(history: SurgeHistory, at: number): number {
  return history.timeline.filter((item) => (item.kind === "smart_change" || item.kind === "smart_end") && Date.parse(item.at) > at - 3_600_000).length;
}

const x = (value: number) => value.toFixed(1);

/** The demo's wording for each kind of the server's timeline. */
export function timelineTitle(item: SurgeTimelineEntry, book: ZoneBook): string {
  switch (item.kind) {
    case "manual_start":
      return tr("Manual surge ×{0} started", [x(item.multiplier)]);
    case "manual_stop":
      return tr("Manual surge stopped");
    case "scheduled_start":
      return tr("Scheduled surge ×{0} started", [x(item.multiplier)]);
    case "scheduled_end":
      return tr("Scheduled surge ended");
    case "smart_end":
      return tr("Smart surge ended");
    case "smart_change": {
      if (item.multiplier <= 1) return tr("Smart surge ended");
      const level = item.previous !== undefined && item.previous > 1 ? tr("Smart surge ×{0} (was ×{1})", [x(item.multiplier), x(item.previous)]) : tr("Smart surge ×{0}", [x(item.multiplier)]);
      const profile = book.smart.profiles.find((entry) => entry.id === item.profileId)?.name;
      return profile ? `${level} · ${profile}` : level;
    }
  }
}

function timelineSource(kind: SurgeTimelineKind): SurgeSource {
  return kind.startsWith("manual") ? "manual" : kind.startsWith("scheduled") ? "scheduled" : "smart";
}

function timelineBy(by: string | undefined): string {
  if (by === "smart") return tr("Smart surge");
  if (by === "scheduled") return tr("Scheduled");
  return by ?? "";
}

/** The server's timeline (newest first) as the demo's timeline rows, at most `limit`. */
export function liveTimeline(history: SurgeHistory, book: ZoneBook, limit = 12): TimelineItem[] {
  return history.timeline
    .map((item, index) => ({
      id: `${history.zoneId}-${item.at}-${item.kind}-${index}`,
      at: Date.parse(item.at),
      source: timelineSource(item.kind),
      title: timelineTitle(item, book),
      by: timelineBy(item.by),
      multiplier: item.multiplier,
      effect: item.effect ? { drivers: item.effect.drivers, ridesPct: item.effect.ridesPct, leftPct: item.effect.leftPct } : null,
    }))
    .filter((item) => Number.isFinite(item.at))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}
