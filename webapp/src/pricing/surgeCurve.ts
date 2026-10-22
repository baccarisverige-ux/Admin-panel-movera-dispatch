/**
 * A manual surge that changes over its time, like a speed curve: the admin drags points on a small graph
 * (time left to right, surge level up and down). The level the riders get moves in steps every 5 minutes,
 * so prices never wobble from one second to the next. A ride keeps the price it was quoted.
 *
 * Contract note: the apps only receive one surge multiplier per quote today. Sending the schedule itself
 * (so apps could show "×1.5 until 18:20, then ×1.2") needs a new contract field, e.g.
 * `rider.surge.schedule: { startAt, endAt, steps: [{ fromMin, multiplier }] }`. Until then the quote engine
 * uses `surgeAt` and the apps see the current step only.
 */

export type CurvePoint = { atMin: number; multiplier: number };
export type SurgeCurve = { startAt: string; endAt: string; points: CurvePoint[] };
export type CurvePreset = "flat" | "rampDown" | "rampUp" | "peak";

export const STEP_MIN = 5;
export const CURVE_PRESETS: { id: CurvePreset; label: string }[] = [
  { id: "flat", label: "Flat" },
  { id: "rampDown", label: "Ramp down" },
  { id: "rampUp", label: "Ramp up" },
  { id: "peak", label: "Peak" },
];

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Quick end-time choices, in minutes. */
export const DURATION_CHIPS = [5, 10, 30, 60, 120] as const;

/** Minutes until the zone's clock next shows `hhmm`, from its current minute of the day (0–1439). */
export function minutesUntil(hhmm: string, currentMinute: number): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const target = Number(match[1]) * 60 + Number(match[2]);
  if (target >= 24 * 60 || Number(match[2]) >= 60) return null;
  const diff = (target - Math.floor(currentMinute) + 24 * 60) % (24 * 60);
  return diff === 0 ? 24 * 60 : diff;
}

/** A starting shape over `durationMin`, between ×1.0 and `top` (the level the admin set). */
export function curvePreset(kind: CurvePreset, durationMin: number, top: number): CurvePoint[] {
  const end = Math.max(STEP_MIN, Math.round(durationMin));
  const high = round1(Math.max(1, top));
  const low = 1;
  const mid = round1(low + (high - low) / 2);
  switch (kind) {
    case "rampDown":
      return [{ atMin: 0, multiplier: high }, { atMin: Math.round(end / 3), multiplier: round1(low + (high - low) * 0.6) }, { atMin: end, multiplier: low }];
    case "rampUp":
      return [{ atMin: 0, multiplier: low }, { atMin: Math.round((end * 2) / 3), multiplier: round1(low + (high - low) * 0.6) }, { atMin: end, multiplier: high }];
    case "peak":
      return [{ atMin: 0, multiplier: mid }, { atMin: Math.round(end / 2), multiplier: high }, { atMin: end, multiplier: mid }];
    default:
      return [{ atMin: 0, multiplier: high }, { atMin: end, multiplier: high }];
  }
}

/** Sorted, inside the duration and the limits, first point at 0 and last at the end. */
export function cleanPoints(points: readonly CurvePoint[], durationMin: number, cap: number): CurvePoint[] {
  const end = Math.max(STEP_MIN, Math.round(durationMin));
  const sorted = [...points]
    .filter((point) => Number.isFinite(point.atMin) && Number.isFinite(point.multiplier))
    .map((point) => ({ atMin: clamp(Math.round(point.atMin), 0, end), multiplier: round1(clamp(point.multiplier, 1, cap)) }))
    .sort((a, b) => a.atMin - b.atMin);
  if (!sorted.length) return [{ atMin: 0, multiplier: 1 }, { atMin: end, multiplier: 1 }];
  if (sorted[0].atMin !== 0) sorted.unshift({ atMin: 0, multiplier: sorted[0].multiplier });
  const last = sorted[sorted.length - 1];
  if (last.atMin !== end) sorted.push({ atMin: end, multiplier: last.multiplier });
  return sorted;
}

/** The curve's value at a minute, straight lines between points. */
export function valueAt(points: readonly CurvePoint[], minute: number): number {
  if (!points.length) return 1;
  if (minute <= points[0].atMin) return points[0].multiplier;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (minute <= b.atMin) {
      const span = b.atMin - a.atMin;
      return span <= 0 ? b.multiplier : a.multiplier + ((b.multiplier - a.multiplier) * (minute - a.atMin)) / span;
    }
  }
  return points[points.length - 1].multiplier;
}

export function durationOf(curve: Pick<SurgeCurve, "startAt" | "endAt">): number {
  return Math.max(0, Math.round((Date.parse(curve.endAt) - Date.parse(curve.startAt)) / 60_000));
}

/** The 5-minute steps riders get: each step takes the curve's value at the start of its slot. */
export function curveSteps(points: readonly CurvePoint[], durationMin: number): { fromMin: number; multiplier: number }[] {
  const steps: { fromMin: number; multiplier: number }[] = [];
  for (let from = 0; from < durationMin; from += STEP_MIN) steps.push({ fromMin: from, multiplier: Math.max(1, round1(valueAt(points, from))) });
  return steps;
}

/** The surge in force at `now`: the current 5-minute step, or null before the start and from the end on. */
export function surgeAt(curve: SurgeCurve, now: number): number | null {
  const start = Date.parse(curve.startAt);
  const end = Date.parse(curve.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || now < start || now >= end) return null;
  const minute = Math.floor((now - start) / 60_000);
  const slot = Math.floor(minute / STEP_MIN) * STEP_MIN;
  return Math.max(1, round1(valueAt(curve.points, slot)));
}

/** The highest level the curve reaches, for history lines and the start check. */
export function curvePeak(points: readonly CurvePoint[]): number {
  return points.reduce((top, point) => Math.max(top, point.multiplier), 1);
}

export function curveIssue(points: readonly CurvePoint[], durationMin: number, cap: number): string | null {
  if (points.length < 2) return "A curve needs at least two points.";
  if (points.some((point) => point.multiplier < 1 || point.multiplier > cap)) return `Every point must be between ×1.0 and ×${cap}.`;
  if (points[0].atMin !== 0 || points[points.length - 1].atMin !== durationMin) return "The curve must cover the whole time.";
  if (points.some((point, index) => index > 0 && point.atMin < points[index - 1].atMin)) return "Points must go left to right.";
  return null;
}
