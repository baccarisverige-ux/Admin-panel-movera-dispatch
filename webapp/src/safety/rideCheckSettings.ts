/**
 * Ride check thresholds: one shared setting for every zone, read by the driver and rider apps.
 * The old shared "Finished far from drop-off (km)" setting is retired: the distance is the zone's own
 * rideCheck.endFarMeters (Dispatch → Safety → Ride check), the only one the apps read.
 * - Unexpected long stop: the car stands still mid-trip for more than Y minutes.
 * Edited from the Dashboard, Dispatch → Live and Dispatch → Rules → Safety; all three save here.
 */

export const RIDE_CHECK_SETTINGS_KEY = "rideCheckSettings";

export type RideCheckSettings = {
  draftRev: number;
  /** Y: minutes the car stood still mid-trip, not at a planned stop. */
  longStopMinutes: number;
};

export type RideCheckThresholds = Pick<RideCheckSettings, "longStopMinutes">;

export const RIDE_CHECK_SETTINGS_DEFAULT: Readonly<RideCheckThresholds> = { longStopMinutes: 2 };

export function emptyRideCheckSettings(): RideCheckSettings {
  return { draftRev: 1, ...RIDE_CHECK_SETTINGS_DEFAULT };
}

export function minutesIssue(minutes: number): string | null {
  return Number.isFinite(minutes) && minutes >= 1 ? null : "Unexpected long stop must be at least 1 minute.";
}

/** Validation: minutes ≥ 1. */
export function rideCheckSettingsIssues(value: RideCheckThresholds): string[] {
  return [minutesIssue(value.longStopMinutes)].filter((line): line is string => Boolean(line));
}

/** A stored value, with anything missing or not valid taken from the defaults. */
export function normalizeRideCheckSettings(value: unknown): RideCheckSettings {
  const base = emptyRideCheckSettings();
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const raw = value as Partial<Record<keyof RideCheckSettings, unknown>>;
  const num = (item: unknown) => (typeof item === "number" ? item : Number.NaN);
  return {
    draftRev: typeof raw.draftRev === "number" && raw.draftRev > 0 ? raw.draftRev : 1,
    longStopMinutes: minutesIssue(num(raw.longStopMinutes)) ? base.longStopMinutes : num(raw.longStopMinutes),
  };
}

/** The next stored value, or the issues that stop the save. */
export function saveRideCheckSettings(current: RideCheckSettings, next: RideCheckThresholds): { value: RideCheckSettings; issues: string[] } {
  const issues = rideCheckSettingsIssues(next);
  if (issues.length) return { value: current, issues };
  return { value: { draftRev: current.draftRev + 1, longStopMinutes: next.longStopMinutes }, issues: [] };
}

/** What the apps read: just the long-stop minutes (the far-from-drop-off distance is per zone). */
export function rideCheckThresholds(settings: RideCheckThresholds): RideCheckThresholds {
  return { longStopMinutes: settings.longStopMinutes };
}

/* ------------------------------------------------------------------ the trigger engine */

/** Straight-line km between two points. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when a Finish more than the zone's endFarMeters from the drop-off opens Ride check right after finish. */
export function finishedFarFromDropoff(kmFromDropoff: number, endFarMeters: number): boolean {
  return Number.isFinite(kmFromDropoff) && kmFromDropoff * 1000 > endFarMeters;
}

/** True when a mid-trip stop this long opens Ride check. */
export function unexpectedLongStop(stoppedMinutes: number, settings: RideCheckThresholds): boolean {
  return Number.isFinite(stoppedMinutes) && stoppedMinutes > settings.longStopMinutes;
}

export type TripEvent =
  | { kind: "finish"; at: { lat: number; lng: number }; dropoff: { lat: number; lng: number } }
  | { kind: "stop"; minutes: number; plannedStop?: boolean; inTraffic?: boolean };

/**
 * Whether a trip event starts Ride check, and why. `on` is the zone's switches and endFarMeters (Dispatch → Safety).
 * The value is what the check stores: metres from the drop-off, or minutes stopped.
 */
export function rideCheckFor(event: TripEvent, settings: RideCheckThresholds, on: { farOn: boolean; stopOn: boolean; endFarMeters: number } = { farOn: true, stopOn: true, endFarMeters: 500 }): { trigger: "far" | "stop"; value: number } | null {
  if (event.kind === "finish") {
    const km = distanceKm(event.at, event.dropoff);
    return on.farOn && finishedFarFromDropoff(km, on.endFarMeters) ? { trigger: "far", value: Math.round(km * 1000) } : null;
  }
  if (event.plannedStop || event.inTraffic) return null;
  return on.stopOn && unexpectedLongStop(event.minutes, settings) ? { trigger: "stop", value: Math.round(event.minutes) } : null;
}
