import contractJson from "../../../../contracts/contract.json" with { type: "json" };
import type { ZoneDispatch } from "./model.ts";

/**
 * v0.18.163 (contract.json#liveTraffic.setting / recall; owner 2026-11-25 "Google trafic réel", then "the cheapest
 * method, about 2 Google calls per trip"): DispatchDocument.liveTraffic { on, offRouteMeters, offRouteSeconds,
 * behindMinutes } per zone or country Standard. Not set = the country's default (on for SE and FR, off elsewhere) and
 * the default thresholds; the panel publishes the field only once the admin changed it (an untouched zone republishes
 * the same document).
 */
type Recall = { offRouteMeters: number; offRouteSeconds: number; behindMinutes: number };
const LT = (contractJson as unknown as { liveTraffic: { defaultOnCountries: string[]; recall: { defaults: Recall; ranges: Record<keyof Recall, [number, number]> } } }).liveTraffic;
export const LIVE_TRAFFIC_DEFAULT_ON: readonly string[] = LT.defaultOnCountries;
export const RECALL_DEFAULTS: Readonly<Recall> = LT.recall.defaults;
export const RECALL_RANGES: Readonly<Record<keyof Recall, [number, number]>> = LT.recall.ranges;
/**
 * v0.18.171 (contract.json#googleRoadLines.setting; owner 2026-11-27 "Google on key screens", cap 4 calls per trip
 * including the quote): DispatchDocument.liveTraffic.roadLines { on, maxCallsPerTrip }. Not set: on follows
 * liveTraffic.on, maxCallsPerTrip 4. The admin may only lower the cap (1..4). The admin itself makes no Google call.
 */
export type RoadLines = { on: boolean; maxCallsPerTrip: number };
export const ROAD_LINES_MAX_CALLS: readonly [number, number] = [1, 4];
export const ROAD_LINES_DEFAULT_MAX_CALLS = 4;
export type LiveTraffic = { on: boolean; roadLines?: RoadLines } & Recall;

/** What the zone's road lines use now: its own value, else on = live traffic on, at most 4 calls. */
export function roadLinesOf(lt: Pick<LiveTraffic, "on" | "roadLines">): RoadLines {
  return lt.roadLines ?? { on: lt.on, maxCallsPerTrip: ROAD_LINES_DEFAULT_MAX_CALLS };
}

const callsInRange = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= ROAD_LINES_MAX_CALLS[0] && v <= ROAD_LINES_MAX_CALLS[1] ? v : ROAD_LINES_DEFAULT_MAX_CALLS);

/** Clamps an admin entry into 1..4 (4 is the maximum: it can never be raised). */
export const clampCallsPerTrip = (v: number): number => Math.min(ROAD_LINES_MAX_CALLS[1], Math.max(ROAD_LINES_MAX_CALLS[0], Math.round(v)));

export const liveTrafficDefault = (country: string | null | undefined): boolean => country != null && LIVE_TRAFFIC_DEFAULT_ON.includes(country);

/** What the zone uses now: its own setting, else the country default with the default thresholds. */
export function liveTrafficOf(zone: Pick<ZoneDispatch, "liveTraffic">, country: string | null | undefined): LiveTraffic {
  return zone.liveTraffic ?? { on: liveTrafficDefault(country), ...RECALL_DEFAULTS };
}

const inRange = (k: keyof Recall, v: unknown): number => {
  const [lo, hi] = RECALL_RANGES[k];
  return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : RECALL_DEFAULTS[k];
};

/** The document's value, or undefined (not set: the country default). */
export function liveTrafficFromDoc(doc: unknown): ZoneDispatch["liveTraffic"] {
  const lt = (doc as { liveTraffic?: Record<string, unknown> } | null)?.liveTraffic;
  if (typeof lt?.["on"] !== "boolean") return undefined;
  const rl = lt["roadLines"] as Record<string, unknown> | undefined;
  const roadLines = rl && typeof rl === "object" ? { roadLines: { on: typeof rl["on"] === "boolean" ? (rl["on"] as boolean) : (lt["on"] as boolean), maxCallsPerTrip: callsInRange(rl["maxCallsPerTrip"]) } } : {};
  return { ...roadLines, on: lt["on"] as boolean, offRouteMeters: inRange("offRouteMeters", lt["offRouteMeters"]), offRouteSeconds: inRange("offRouteSeconds", lt["offRouteSeconds"]), behindMinutes: inRange("behindMinutes", lt["behindMinutes"]) };
}
