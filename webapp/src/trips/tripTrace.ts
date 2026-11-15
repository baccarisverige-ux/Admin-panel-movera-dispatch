import { ApiError } from "../api/httpClient.ts";
import type { LatLng } from "../dashboard/route.ts";
import { tr, uiLocale } from "../i18n/index.ts";
import { shortDate } from "../live/format.ts";
import type { TripTrace } from "../live/types.ts";

/**
 * BQ-A08 (owner 2026-10-30 "Road route + driven line (Recommended)", Rules decisions/driver-g11.md:6-8): the admin trip
 * page draws the car's real driven line from GET /admin/trips/{tripId}/trace next to the planned route.
 * The trace is every fix the server kept (no limit), so it is cleaned the same way as GET /trips/{tripId}/path
 * (contract.json#tripPath.driven: accuracy ≤ 50 m, a step only once the car moved 25 m, no step faster than 150 km/h)
 * and evenly thinned to at most contract.json#tripPath.maxPoints points, first and last kept.
 */
export const TRACE_MAX_ACCURACY_M = 50;
export const TRACE_MIN_STEP_M = 25;
export const TRACE_MAX_KMH = 150;
export const TRACE_MAX_POINTS = 300;

type Fix = TripTrace["fixes"][number];

function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The cleaned, thinned line ([lat, lng], in time order); [] when fewer than 2 points are left. */
export function drivenLine(fixes: readonly Fix[], maxPoints = TRACE_MAX_POINTS): LatLng[] {
  const kept: Fix[] = [];
  for (const item of fixes) {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
    if (typeof item.accuracy === "number" && item.accuracy > TRACE_MAX_ACCURACY_M) continue;
    const last = kept.at(-1);
    if (last) {
      const step = meters(last, item);
      if (step < TRACE_MIN_STEP_M) continue;
      const seconds = (Date.parse(item.measuredAt) - Date.parse(last.measuredAt)) / 1000;
      if (seconds > 0 && (step / seconds) * 3.6 > TRACE_MAX_KMH) continue;
    }
    kept.push(item);
  }
  // The car's last fix counts even when it moved less than a step since the last kept one (it is where the car is).
  const tail = fixes.at(-1);
  if (tail && kept.length && kept.at(-1) !== tail && (typeof tail.accuracy !== "number" || tail.accuracy <= TRACE_MAX_ACCURACY_M) && meters(kept.at(-1)!, tail) < TRACE_MIN_STEP_M && meters(kept.at(-1)!, tail) > 0) kept.push(tail);
  if (kept.length < 2) return [];
  const line = kept.length <= maxPoints ? kept : Array.from({ length: maxPoints }, (_, i) => kept[Math.round((i * (kept.length - 1)) / (maxPoints - 1))]!);
  return line.map((item) => [item.lat, item.lng] as LatLng);
}

export type TraceView =
  | { state: "driven"; line: LatLng[]; fixCount: number; keptUntil: string | null }
  | { state: "empty"; line: LatLng[]; keptUntil: string | null }
  | { state: "deleted"; line: LatLng[] }
  | { state: "failed"; line: LatLng[] };

/** The answer (or the error) of GET /admin/trips/{tripId}/trace as what the page shows. */
export function traceView(answer: TripTrace | unknown): TraceView {
  if (answer instanceof ApiError || answer instanceof Error) {
    return answer instanceof ApiError && answer.status === 404 && answer.reason === "trace_deleted" ? { state: "deleted", line: [] } : { state: "failed", line: [] };
  }
  const trace = answer as TripTrace | null | undefined;
  if (!trace || !Array.isArray(trace.fixes)) return { state: "failed", line: [] };
  const line = drivenLine(trace.fixes);
  return line.length ? { state: "driven", line, fixCount: trace.fixes.length, keptUntil: trace.keptUntil ?? null } : { state: "empty", line: [], keptUntil: trace.keptUntil ?? null };
}

/** One line under the map. */
export function traceLine(view: TraceView): string {
  if (view.state === "driven") {
    const kept = view.keptUntil ? shortDate(view.keptUntil, uiLocale()) : "";
    return kept ? tr("Driven route: {0} GPS positions · kept until {1}", [view.fixCount, kept]) : tr("Driven route: {0} GPS positions", [view.fixCount]);
  }
  if (view.state === "empty") return tr("No driven route yet: the driver app has sent no position on this trip. The planned route is shown.");
  if (view.state === "deleted") return tr("The driven route was deleted 30 days after the trip. The planned route is shown.");
  return tr("The driven route could not be loaded. The planned route is shown.");
}
