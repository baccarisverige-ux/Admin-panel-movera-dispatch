import { addLocalDays, dayStart, localDay, localParts, startOfLocalDay, zonedTime } from "./time.ts";
import { tr } from "../i18n/core.ts";

export type PeriodKind = "today" | "week" | "month" | "year" | "date" | "range";
export type Period = { kind: PeriodKind; on?: string; from?: string; to?: string };
export type Bucket = "hour" | "day" | "month";

export type PeriodWindow = {
  start: number;
  /** End of the window, never later than now. */
  end: number;
  /** End of the calendar span (a whole day, week, …) the window belongs to. */
  spanEnd: number;
  prevStart: number;
  prevEnd: number;
  bucket: Bucket;
  label: string;
  compareLabel: string;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = 3_600_000;

export function parsePeriod(params: URLSearchParams): Period {
  const kind = params.get("period");
  if (kind === "date" && DAY.test(params.get("on") ?? "")) return { kind, on: params.get("on")! };
  if (kind === "range") {
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    if (DAY.test(from) && DAY.test(to) && from <= to) return { kind, from, to };
  }
  if (kind === "week" || kind === "month" || kind === "year") return { kind };
  return { kind: "today" };
}

/** Same as parsePeriod, but a page can choose what an empty URL means. */
export function parsePeriodOr(params: URLSearchParams, fallback: Period): Period {
  return params.get("period") ? parsePeriod(params) : fallback;
}

export function periodParams(period: Period, params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ["period", "on", "from", "to"]) next.delete(key);
  next.set("period", period.kind);
  if (period.kind === "date" && period.on) next.set("on", period.on);
  if (period.kind === "range" && period.from && period.to) {
    next.set("from", period.from);
    next.set("to", period.to);
  }
  return next;
}

function bucketFor(length: number): Bucket {
  if (length <= 2 * 24 * HOUR + HOUR) return "hour";
  if (length <= 93 * 24 * HOUR) return "day";
  return "month";
}

/** The window a period covers in the market's time zone, and the equal span before it. */
export function periodWindow(period: Period, nowMs: number, timeZone: string, locale = "en-GB"): PeriodWindow {
  const today = startOfLocalDay(nowMs, timeZone);
  const p = localParts(nowMs, timeZone);
  const dayFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone });
  const capped = (start: number, spanEnd: number, prevStart: number, bucket: Bucket, label: string, compareLabel: string): PeriodWindow => {
    const end = Math.max(start, Math.min(spanEnd, nowMs));
    return { start, end, spanEnd, prevStart, prevEnd: prevStart + (end - start), bucket, label, compareLabel };
  };
  if (period.kind === "week") {
    const start = startOfLocalDay(nowMs, timeZone, -p.weekday);
    return capped(start, startOfLocalDay(start + HOUR, timeZone, 7), startOfLocalDay(start + HOUR, timeZone, -7), "day", tr("This week"), tr("vs same time last week"));
  }
  if (period.kind === "month") {
    const start = zonedTime(p.year, p.month, 1, 0, timeZone);
    const next = zonedTime(p.month === 12 ? p.year + 1 : p.year, p.month === 12 ? 1 : p.month + 1, 1, 0, timeZone);
    const prev = zonedTime(p.month === 1 ? p.year - 1 : p.year, p.month === 1 ? 12 : p.month - 1, 1, 0, timeZone);
    return capped(start, next, prev, "day", new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone }).format(nowMs), tr("vs same time last month"));
  }
  if (period.kind === "year") {
    const start = zonedTime(p.year, 1, 1, 0, timeZone);
    return capped(start, zonedTime(p.year + 1, 1, 1, 0, timeZone), zonedTime(p.year - 1, 1, 1, 0, timeZone), "month", String(p.year), tr("vs same time last year"));
  }
  if (period.kind === "date" && period.on) {
    const start = dayStart(period.on, timeZone);
    const spanEnd = dayStart(addLocalDays(period.on, 1), timeZone);
    return capped(start, spanEnd, dayStart(addLocalDays(period.on, -1), timeZone), "hour", dayFormat.format(start + HOUR), tr("vs the day before"));
  }
  if (period.kind === "range" && period.from && period.to) {
    const start = dayStart(period.from, timeZone);
    const spanEnd = dayStart(addLocalDays(period.to, 1), timeZone);
    const days = Math.round((spanEnd - start) / (24 * HOUR));
    const prevStart = dayStart(addLocalDays(period.from, -days), timeZone);
    return capped(start, spanEnd, prevStart, bucketFor(spanEnd - start), `${dayFormat.format(start + HOUR)} – ${dayFormat.format(spanEnd - HOUR)}`, `vs the ${days} days before`);
  }
  return capped(today, startOfLocalDay(today + HOUR, timeZone, 1), startOfLocalDay(today + HOUR, timeZone, -1), "hour", tr("Today"), tr("vs same time yesterday"));
}

/** Bucket start instants from `start` up to (not including) `end`, on local calendar boundaries. */
export function bucketStarts(start: number, end: number, bucket: Bucket, timeZone: string): number[] {
  const out: number[] = [];
  if (bucket === "hour") {
    for (let at = start; at < end; at += HOUR) out.push(at);
    return out;
  }
  if (bucket === "day") {
    let day = localDay(start + HOUR, timeZone);
    for (let at = dayStart(day, timeZone); at < end; at = dayStart(day, timeZone)) {
      out.push(at);
      day = addLocalDays(day, 1);
    }
    return out;
  }
  const first = localParts(start + HOUR, timeZone);
  for (let index = 0; ; index += 1) {
    const month = first.month - 1 + index;
    const at = zonedTime(first.year + Math.floor(month / 12), (month % 12) + 1, 1, 0, timeZone);
    if (at >= end) break;
    out.push(at);
  }
  return out;
}

export function bucketLabel(at: number, bucket: Bucket, timeZone: string, locale: string): string {
  if (bucket === "hour") return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(at);
  if (bucket === "day") return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone }).format(at);
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone }).format(at);
}

/**
 * The window a period covers at `nowMs`, with its end pushed on to `untilMs` (never past the period's own end).
 * Reports round "now" up to the next minute so work done after opening the page counts; the period itself must be
 * chosen from the real now, or at 23:59 the rounded minute is 00:00 of the next day and "Today" is an empty window.
 */
export function periodWindowUntil(period: Period, nowMs: number, untilMs: number, timeZone: string, locale = "en-GB"): PeriodWindow {
  const base = periodWindow(period, nowMs, timeZone, locale);
  const end = Math.max(base.end, Math.min(base.spanEnd, untilMs));
  return { ...base, end, prevEnd: base.prevStart + (end - base.start) };
}
