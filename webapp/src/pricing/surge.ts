import { localParts } from "../dashboard/time.ts";
import { marketOfZone, zoneById } from "../markets/markets.ts";
import { demandSeries, type ZoneDemand } from "./demand.ts";
import { surgeAt } from "./surgeCurve.ts";
import type { SmartSurge, SurgeEvent, SurgeProfile, ZoneBook, ZoneLive } from "./zonePricing.ts";

/** Which surge is on in a zone right now, and why. Manual wins, then scheduled, then smart. */

export type SurgeSource = "manual" | "scheduled" | "smart" | "off";
export type SurgeLevel = "none" | "low" | "mid" | "high" | "extreme";

export type ZoneSurge = {
  zoneId: string;
  name: string;
  center: [number, number];
  airport: boolean;
  multiplier: number;
  source: SurgeSource;
  level: SurgeLevel;
  profile: SurgeProfile | null;
  /** Why smart surge is not running, when it is not. */
  smartNote: string | null;
  ratio: number;
  requests: number;
  free: number;
  endsAt: string | null;
  scheduledName: string | null;
  /**
   * Live panel only (contract v0.7.2 surgeLive): false while the server has no SurgeSample for the zone yet, so
   * requests, free drivers and ratio are not known (they are 0 then and must not be shown as data).
   */
  demandKnown?: boolean;
};

export const LEVEL_COLOR: Record<SurgeLevel, string> = {
  none: "#1baf7a",
  low: "#f2c94c",
  mid: "#f2994a",
  high: "#e34948",
  extreme: "#7b3fe4",
};

export const LEVEL_LABEL: Record<SurgeLevel, string> = {
  none: "No surge",
  low: "×1.1 – 1.4",
  mid: "×1.5 – 1.9",
  high: "×2.0 – 2.9",
  extreme: "×3 and above",
};

export function surgeLevel(multiplier: number): SurgeLevel {
  if (multiplier < 1.05) return "none";
  if (multiplier < 1.5) return "low";
  if (multiplier < 2) return "mid";
  if (multiplier < 3) return "high";
  return "extreme";
}

/** Slider colour for a value: green, then orange, then red, violet at the top. */
export function sliderColor(multiplier: number): string {
  return LEVEL_COLOR[surgeLevel(multiplier)];
}

export function minuteOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function inRange(from: number, to: number, minute: number): boolean {
  if (from === to) return true;
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

/** A window that passes midnight belongs to the day it starts on. */
export function profileMatches(profile: SurgeProfile, weekday: number, minute: number): boolean {
  if (profile.isDefault) return true;
  const yesterday = (weekday + 6) % 7;
  return profile.windows.some((window) => {
    const from = minuteOf(window.from);
    const to = minuteOf(window.to);
    if (from === to) return profile.days.includes(weekday);
    if (from < to) return profile.days.includes(weekday) && minute >= from && minute < to;
    return (profile.days.includes(weekday) && minute >= from) || (profile.days.includes(yesterday) && minute < to);
  });
}

/** The first matching profile from the top wins; Normal is the fallback. */
export function activeProfile(smart: SmartSurge, at: number, timeZone: string): SurgeProfile | null {
  const local = localParts(at, timeZone);
  const minute = local.hour * 60 + local.minute;
  return smart.profiles.find((profile) => !profile.isDefault && profileMatches(profile, local.weekday, minute))
    ?? smart.profiles.find((profile) => profile.isDefault)
    ?? null;
}

export function inActiveHours(smart: SmartSurge, at: number, timeZone: string): boolean {
  const local = localParts(at, timeZone);
  return inRange(minuteOf(smart.activeFrom), minuteOf(smart.activeTo), local.hour * 60 + local.minute);
}

/** Highest step that requests per free online driver reach, never above the cap. */
export function smartMultiplier(profile: SurgeProfile, ratio: number): number {
  let multiplier = 1;
  for (const step of profile.steps) if (ratio >= step.ratio) multiplier = step.multiplier;
  return Math.min(multiplier, profile.cap);
}

export function zoneSurge(book: ZoneBook, live: ZoneLive, demand: ZoneDemand, at: number): ZoneSurge {
  const zone = zoneById(book.zoneId);
  const timeZone = marketOfZone(book.zoneId)?.timeZone ?? "Europe/Stockholm";
  const base = {
    zoneId: book.zoneId,
    name: zone?.name ?? book.zoneId,
    center: zone?.center ?? [0, 0] as [number, number],
    airport: zone?.kind === "airport",
    ratio: demand.ratio,
    requests: demand.requests,
    free: demand.free,
  };
  const profile = activeProfile(book.smart, at, timeZone);
  const smartNote = !book.smart.enabled ? "Smart surge is off" : !inActiveHours(book.smart, at, timeZone) ? "Outside smart surge hours" : null;
  if (live.manual && Date.parse(live.manual.endsAt) > at && Date.parse(live.manual.startedAt) <= at) {
    // A curve gives the current 5-minute step; a plain manual surge keeps one level.
    const multiplier = live.manual.curve ? surgeAt(live.manual.curve, at) ?? 1 : live.manual.multiplier;
    return { ...base, multiplier, source: "manual", level: surgeLevel(multiplier), profile, smartNote: "Paused while the manual surge runs", endsAt: live.manual.endsAt, scheduledName: null };
  }
  const scheduled = book.scheduled.find((item) => Date.parse(item.startsAt) <= at && Date.parse(item.endsAt) > at);
  if (scheduled) {
    return { ...base, multiplier: scheduled.multiplier, source: "scheduled", level: surgeLevel(scheduled.multiplier), profile, smartNote: "Paused while the scheduled surge runs", endsAt: scheduled.endsAt, scheduledName: scheduled.name };
  }
  if (!smartNote && profile) {
    const multiplier = smartMultiplier(profile, demand.ratio);
    if (multiplier > 1) return { ...base, multiplier, source: "smart", level: surgeLevel(multiplier), profile, smartNote: null, endsAt: null, scheduledName: null };
  }
  return { ...base, multiplier: 1, source: "off", level: "none", profile, smartNote, endsAt: null, scheduledName: null };
}

export type SurgeAlert = {
  id: string;
  zoneId: string;
  tone: "critical" | "warning";
  title: string;
  detail: string;
  action: "manual" | "settings" | "stop";
};

/** How many times smart surge changed level in the last hour, from the demand model. */
export function smartChanges(book: ZoneBook, at: number): number {
  const timeZone = marketOfZone(book.zoneId)?.timeZone ?? "Europe/Stockholm";
  let changes = 0;
  let last: number | null = null;
  for (const point of demandSeries(book.zoneId, at, 1, 5)) {
    const profile = activeProfile(book.smart, point.at, timeZone);
    const value = profile ? smartMultiplier(profile, point.ratio) : 1;
    if (last !== null && value !== last) changes += 1;
    last = value;
  }
  return changes;
}

/**
 * Alerts only for what needs a person: a manual surge, an error, or smart surge misbehaving. The live panel passes
 * `changes` (smart surge level changes in the last hour from the server's timeline; null = not known, no alert).
 */
export function surgeAlerts(rows: readonly { book: ZoneBook; live: ZoneLive; surge: ZoneSurge }[], at: number, changes: (book: ZoneBook) => number | null = (book) => smartChanges(book, at)): SurgeAlert[] {
  const alerts: SurgeAlert[] = [];
  for (const { book, live, surge } of rows) {
    const top = surge.profile?.steps[surge.profile.steps.length - 1];
    const short = surge.demandKnown !== false && (top ? surge.ratio >= top.ratio : surge.ratio >= 3);
    if (surge.source !== "manual" && short) {
      const cause = surge.smartNote ?? (surge.profile && surge.multiplier >= surge.profile.cap ? `smart surge is at its cap ×${surge.profile.cap}` : "smart surge is at its highest step");
      alerts.push({ id: `${surge.zoneId}-manual`, zoneId: surge.zoneId, tone: "critical", title: `${surge.name} needs a manual surge`, detail: `${surge.requests} ride requests · ${surge.free} free online drivers · ${cause.charAt(0).toLowerCase()}${cause.slice(1)}.`, action: "manual" });
    }
    if (book.smart.enabled && (surge.demandKnown === false || (surge.requests === 0 && surge.free === 0))) {
      alerts.push({ id: `${surge.zoneId}-nodata`, zoneId: surge.zoneId, tone: "warning", title: `No live data from ${surge.name}`, detail: "Smart surge cannot work here until riders or drivers show up.", action: "settings" });
    }
    if (live.manual && Date.parse(live.manual.endsAt) > at && at - Date.parse(live.manual.startedAt) > 3 * 3_600_000) {
      alerts.push({ id: `${surge.zoneId}-long`, zoneId: surge.zoneId, tone: "warning", title: `Manual surge in ${surge.name} has run over 3 h`, detail: `×${live.manual.multiplier.toFixed(1)} since ${new Date(live.manual.startedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Check it is still needed.`, action: "stop" });
    }
    if (book.smart.enabled && surge.source !== "manual" && (changes(book) ?? 0) >= 6) {
      alerts.push({ id: `${surge.zoneId}-flap`, zoneId: surge.zoneId, tone: "warning", title: `Smart surge in ${surge.name} goes up and down too often`, detail: `It changed level 6 or more times in the last hour. Raise "start only if it holds" above ${book.smart.holdMin} min.`, action: "settings" });
    }
  }
  return alerts.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "critical" ? -1 : 1));
}

export type TimelineItem = {
  id: string;
  at: number;
  source: SurgeSource;
  title: string;
  by: string;
  multiplier: number;
  effect: { drivers: number; ridesPct: number; leftPct: number } | null;
};

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** What a surge did: drivers who came, change in rides, riders who left on the price. Demo model. */
export function surgeEffect(id: string, multiplier: number): { drivers: number; ridesPct: number; leftPct: number } {
  const seed = hash(id);
  const strength = Math.max(0, multiplier - 1);
  return {
    drivers: Math.round(strength * (4 + (seed % 6))),
    ridesPct: Math.round(strength * (14 + (seed >>> 4) % 12) - strength * strength * 6),
    leftPct: Math.round(3 + strength * (9 + (seed >>> 8) % 8)),
  };
}

/** Manual starts and stops from the log, plus smart surge level changes over the last hours. */
export function surgeTimeline(book: ZoneBook, log: readonly SurgeEvent[], at: number, hours = 12): TimelineItem[] {
  const timeZone = marketOfZone(book.zoneId)?.timeZone ?? "Europe/Stockholm";
  const items: TimelineItem[] = log
    // v0.7.2 (owner 2026-10-28): no surge notice to drivers; an old "notify" entry is not shown.
    .filter((event) => event.zoneId === book.zoneId && event.kind !== "notify" && Date.parse(event.at) > at - 7 * 86_400_000)
    .map((event) => ({
      id: event.id,
      at: Date.parse(event.at),
      source: "manual" as const,
      title: event.kind === "manual-start" ? `Manual surge ×${event.multiplier.toFixed(1)} started` : "Manual surge stopped",
      by: event.by,
      multiplier: event.multiplier,
      effect: event.kind === "manual-start" ? surgeEffect(event.id, event.multiplier) : null,
    }));
  if (book.smart.enabled) {
    let last = 1;
    for (const point of demandSeries(book.zoneId, at, hours, 10)) {
      const profile = activeProfile(book.smart, point.at, timeZone);
      const value = profile && inActiveHours(book.smart, point.at, timeZone) ? smartMultiplier(profile, point.ratio) : 1;
      if (value !== last) {
        const id = `${book.zoneId}-smart-${point.at}`;
        items.push({ id, at: point.at, source: "smart", title: value > 1 ? `Smart surge ×${value.toFixed(1)}${last > 1 ? ` (was ×${last.toFixed(1)})` : ""} · ${profile?.name ?? ""}` : "Smart surge ended", by: "Smart surge", multiplier: value, effect: value > last ? surgeEffect(id, value) : null });
        last = value;
      }
    }
  }
  return items.sort((a, b) => b.at - a.at);
}

/** Riders who saw a surge price in the last hour, and how many left without booking. */
export function priceCheck(surge: ZoneSurge): { saw: number; left: number; leftPct: number } {
  if (surge.multiplier <= 1) return { saw: 0, left: 0, leftPct: 0 };
  const saw = Math.max(1, Math.round(surge.requests * 6 * (0.8 + (hash(surge.zoneId) % 40) / 100)));
  const leftPct = Math.min(80, Math.round(4 + (surge.multiplier - 1) * 17 + (hash(`${surge.zoneId}:left`) % 6)));
  return { saw, left: Math.round((saw * leftPct) / 100), leftPct };
}
