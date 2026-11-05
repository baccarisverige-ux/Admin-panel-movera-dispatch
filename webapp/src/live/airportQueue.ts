import contract from "../../../contracts/contract.json" with { type: "json" };
import type { AirportQueue } from "../dashboard/insights.ts";

/**
 * Fix job 9 (contract v0.18.36 §60, contract.json#airportQueue): an airport zone's queue area and the Dashboard feed.
 *  - GET|PUT /admin/zones/{zoneId}/queue-area (zones.read / zones.edit) → AirportQueueArea; 404 = none drawn yet.
 *  - GET /admin/airport-queues (zones.read) → { items: [{ areaId, airportZoneId, on, waiting, longestWaitMin, pickupsLastHour }] }.
 * Pure, so node --test covers it.
 */

type Defaults = { on: boolean; leaveGraceMin: number; offerSeconds: number; maxQueueOffers: number; keepPlaceAfterDecline: boolean };
type Ranges = { leaveGraceMin: [number, number]; offerSeconds: [number, number]; maxQueueOffers: [number, number] };
const AQ = (contract as unknown as { airportQueue: { defaults: Defaults; ranges: Ranges } }).airportQueue;

export const QUEUE_DEFAULTS: Defaults = AQ.defaults;
export const QUEUE_RANGES: Ranges = AQ.ranges;
export const AIRPORT_QUEUES_PATH = "/admin/airport-queues";
export const queueAreaPath = (zoneId: string) => `/admin/zones/${encodeURIComponent(zoneId)}/queue-area`;

export type QueueArea = Defaults & { areaId: string; airportZoneId: string; polygon: [number, number][]; updatedAt?: string };
export type QueueAreaInput = Defaults & { polygon: [number, number][] };
export type QueueFeedItem = { areaId: string; airportZoneId: string; on: boolean; waiting: number; longestWaitMin: number; pickupsLastHour: number };

const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, Math.round(value)));

/** The PUT body: the whole area (a save never keeps an older number silently), numbers inside the contract ranges. */
export function queueAreaBody(input: QueueAreaInput): QueueAreaInput {
  if (input.polygon.length < 3) throw new Error("A queue area needs at least 3 points.");
  return {
    polygon: input.polygon,
    on: input.on,
    leaveGraceMin: clamp(input.leaveGraceMin, QUEUE_RANGES.leaveGraceMin),
    offerSeconds: clamp(input.offerSeconds, QUEUE_RANGES.offerSeconds),
    maxQueueOffers: clamp(input.maxQueueOffers, QUEUE_RANGES.maxQueueOffers),
    keepPlaceAfterDecline: input.keepPlaceAfterDecline,
  };
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function parseQueueArea(value: unknown): QueueArea | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (typeof r.areaId !== "string" || typeof r.airportZoneId !== "string" || !Array.isArray(r.polygon) || typeof r.on !== "boolean") return null;
  if (!num(r.leaveGraceMin) || !num(r.offerSeconds) || !num(r.maxQueueOffers) || typeof r.keepPlaceAfterDecline !== "boolean") return null;
  return {
    areaId: r.areaId, airportZoneId: r.airportZoneId, polygon: r.polygon as [number, number][], on: r.on,
    leaveGraceMin: r.leaveGraceMin, offerSeconds: r.offerSeconds, maxQueueOffers: r.maxQueueOffers, keepPlaceAfterDecline: r.keepPlaceAfterDecline,
    ...(typeof r.updatedAt === "string" ? { updatedAt: r.updatedAt } : {}),
  };
}

export function parseQueueFeed(value: unknown): QueueFeedItem[] | null {
  const items = (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  return items.flatMap((x) => {
    const r = x as Record<string, unknown>;
    return typeof r.airportZoneId === "string" && typeof r.areaId === "string" && typeof r.on === "boolean" && num(r.waiting) && num(r.longestWaitMin) && num(r.pickupsLastHour)
      ? [{ areaId: r.areaId, airportZoneId: r.airportZoneId, on: r.on, waiting: r.waiting, longestWaitMin: r.longestWaitMin, pickupsLastHour: r.pickupsLastHour }]
      : [];
  });
}

/** The Dashboard airport card rows: the queues that are on, from the server only (null = not loaded / failed). */
export function airportCards(feed: QueueFeedItem[] | null, nameOf: (zoneId: string) => string): AirportQueue[] | null {
  if (feed === null) return null;
  return feed.filter((item) => item.on).map((item) => ({ zoneId: item.airportZoneId, name: nameOf(item.airportZoneId), waiting: item.waiting, waitMin: item.longestWaitMin, pickupsLastHour: item.pickupsLastHour }));
}
