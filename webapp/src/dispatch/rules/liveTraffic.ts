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
export type LiveTraffic = { on: boolean } & Recall;

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
  return { on: lt["on"] as boolean, offRouteMeters: inRange("offRouteMeters", lt["offRouteMeters"]), offRouteSeconds: inRange("offRouteSeconds", lt["offRouteSeconds"]), behindMinutes: inRange("behindMinutes", lt["behindMinutes"]) };
}
