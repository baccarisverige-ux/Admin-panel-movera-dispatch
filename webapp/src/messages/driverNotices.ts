import type { MarketId } from "../markets/markets.ts";
import { tr } from "../i18n/core.ts";

/**
 * Driver notifications (Round 3, Q31 + Q31b). Admin sets each kind on or off, its text per language, whether it pops up
 * on the island and whether it also reaches drivers who are offline or have the app closed. N1 ride alerts, N2 demand
 * and events, N3 account and money, N4 limits (promo messages per day, quiet hours). Ride alerts always go through.
 * The kind ids are the driver app's (DriverNoticeKind in driver_notifications.dart).
 */

export const DRIVER_NOTICES_KEY = "driverNotices";

export type NoticeLang = "en" | "sv" | "fr" | "ar";
export const NOTICE_LANGS: { id: NoticeLang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "sv", label: "Swedish" },
  { id: "fr", label: "French" },
  { id: "ar", label: "Arabic" },
];

export type NoticeGroup = "rideAlerts" | "demand" | "account";
export const NOTICE_GROUPS: { id: NoticeGroup; code: string; label: string; help: string }[] = [
  { id: "rideAlerts", code: "N1", label: "Ride alerts", help: "New scheduled rides, Exclusive offers, reminders and “Leave now”. They always go through, also in quiet hours." },
  { id: "demand", code: "N2", label: "Demand and events", help: "Busy areas and event messages that you send. They count toward the daily limit and wait until quiet hours end." },
  { id: "account", code: "N3", label: "Account and money", help: "Documents, rest, paused scheduled rides, payouts and bonus progress. They wait until quiet hours end." },
];

export type NoticeKind =
  | "newScheduledRide" | "exclusiveOffer" | "scheduledReminder" | "leaveNow"
  | "highDemand" | "event"
  | "documentExpiring" | "documentApproved" | "restOver" | "scheduledPaused" | "payoutSent" | "bonusProgress";

export type NoticeDef = { kind: NoticeKind; group: NoticeGroup; label: string; when: string; title: string; body: string; action?: string };

/** The app's default words. Values in braces are filled in by the app. */
export const NOTICE_KINDS: NoticeDef[] = [
  { kind: "newScheduledRide", group: "rideAlerts", label: "New scheduled ride", when: "A scheduled ride the driver can take", title: "New scheduled ride", body: "{day} {time} · {fare} · Tap to view", action: "View" },
  { kind: "exclusiveOffer", group: "rideAlerts", label: "Exclusive offer", when: "An offer only this driver gets", title: "Exclusive offer", body: "{seconds} s to accept" },
  { kind: "scheduledReminder", group: "rideAlerts", label: "Scheduled ride reminder", when: "At the reminder times before pickup", title: "{time} pickup in {left}", body: "Pickup at {time} in {left}: {address}.", action: "View" },
  { kind: "leaveNow", group: "rideAlerts", label: "Leave now", when: "When it is time to drive to the pickup", title: "Leave now for {time} pickup", body: "Drive to {address} now.", action: "View" },
  { kind: "highDemand", group: "demand", label: "High demand", when: "When you send it", title: "High demand in {area}", body: "Go online now" },
  { kind: "event", group: "demand", label: "Event", when: "When you send it", title: "Event in {area}", body: "{time} · Be online before it ends." },
  { kind: "documentExpiring", group: "account", label: "Document expiring", when: "At the document warnings (Onboarding)", title: "{document} expires {when}", body: "Upload a new one so you can keep driving.", action: "Upload new" },
  { kind: "documentApproved", group: "account", label: "Document approved", when: "When an admin approves a document", title: "Document approved", body: "{document} approved. You can go online." },
  { kind: "restOver", group: "account", label: "Rest over", when: "When the rest after the driving limit ends", title: "Rest over", body: "You can go online again." },
  { kind: "scheduledPaused", group: "account", label: "Scheduled rides paused", when: "When late cancels pause scheduled rides", title: "Scheduled rides paused", body: "Too many late cancels. Back on {until}.", action: "View" },
  { kind: "payoutSent", group: "account", label: "Payout sent", when: "When a payout leaves Movera", title: "Payout sent", body: "{amount} is on its way to your bank." },
  { kind: "bonusProgress", group: "account", label: "Bonus progress", when: "When a bonus is close", title: "Bonus progress", body: "{done} of {goal} trips this week. {more} more for {bonus}." },
];

export const SAMPLE: Record<string, string> = {
  day: "Tomorrow", time: "07:40", fare: "126 kr", seconds: "8", left: "15 min", address: "Sveavägen 44", area: "Stockholm City",
  document: "Driving licence", when: "in 7 days", until: "22 Oct", amount: "2 450,00 kr", done: "18", goal: "25", more: "7", bonus: "350 kr",
};

export type NoticeText = { title: string; body: string };
export type NoticeSetting = { on: boolean; island: boolean; offline: boolean; texts: Partial<Record<NoticeLang, Partial<NoticeText>>> };
export type NoticeLimits = { promoPerDay: { on: boolean; max: number }; quiet: { on: boolean; from: string; to: string } };
export type NoticeArea = { name: string; center: [number, number]; radiusKm: number };
export type NoticeReach = "online" | "offline" | "all";
export type SentNotice = {
  id: string; at: string; by: string; kind: "highDemand" | "event"; country: MarketId; zoneId: string; area: NoticeArea;
  groupId: string | null; reach: NoticeReach; title: string; body: string; driverIds: string[]; skipped: number; sendsAt: string | null;
};
export type DriverNoticeBook = { draftRev: number; kinds: Record<NoticeKind, NoticeSetting>; limits: Record<MarketId, NoticeLimits>; sent: SentNotice[] };

export function defaultSetting(): NoticeSetting {
  return { on: true, island: true, offline: true, texts: {} };
}

export function defaultLimits(country: MarketId): NoticeLimits {
  return { promoPerDay: { on: true, max: 2 }, quiet: { on: true, from: country === "TN" ? "23:00" : "22:00", to: "07:00" } };
}

export function emptyDriverNoticeBook(): DriverNoticeBook {
  return {
    draftRev: 1,
    kinds: Object.fromEntries(NOTICE_KINDS.map((def) => [def.kind, defaultSetting()])) as Record<NoticeKind, NoticeSetting>,
    limits: { SE: defaultLimits("SE"), FR: defaultLimits("FR"), TN: defaultLimits("TN") },
    sent: [],
  };
}

export function normalizeDriverNoticeBook(value: unknown): DriverNoticeBook {
  const base = emptyDriverNoticeBook();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<DriverNoticeBook>;
  const kinds = { ...base.kinds };
  for (const def of NOTICE_KINDS) {
    const saved = raw.kinds?.[def.kind];
    if (saved && typeof saved === "object") kinds[def.kind] = { ...base.kinds[def.kind], ...saved, texts: saved.texts && typeof saved.texts === "object" ? saved.texts : {} };
  }
  const limits = { ...base.limits };
  for (const id of Object.keys(base.limits) as MarketId[]) {
    const saved = raw.limits?.[id];
    if (saved) limits[id] = { promoPerDay: { ...base.limits[id].promoPerDay, ...(saved.promoPerDay ?? {}) }, quiet: { ...base.limits[id].quiet, ...(saved.quiet ?? {}) } };
  }
  return { draftRev: typeof raw.draftRev === "number" && raw.draftRev > 0 ? raw.draftRev : 1, kinds, limits, sent: Array.isArray(raw.sent) ? raw.sent : [] };
}

export function noticeDef(kind: NoticeKind): NoticeDef {
  return NOTICE_KINDS.find((def) => def.kind === kind)!;
}

/** always: ride alerts go through, also in quiet hours. promo: count toward the daily limit and wait for quiet hours. quiet: wait for quiet hours. */
export function limitOf(kind: NoticeKind): "always" | "promo" | "quiet" {
  const group = noticeDef(kind).group;
  return group === "rideAlerts" ? "always" : group === "demand" ? "promo" : "quiet";
}

const valuesIn = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))];
export const fillNotice = (text: string, values: Record<string, string> = SAMPLE) => text.replace(/\{(\w+)\}/g, (all, name: string) => values[name] ?? all);

/** What the driver gets: admin's words for the language, or the app's default. */
export function noticeText(setting: NoticeSetting, kind: NoticeKind, lang: NoticeLang): NoticeText & { own: boolean } {
  const def = noticeDef(kind);
  const title = setting.texts[lang]?.title?.trim();
  const body = setting.texts[lang]?.body?.trim();
  return { title: title || def.title, body: body || def.body, own: Boolean(title || body) };
}

export const TITLE_MAX = 60;
export const BODY_MAX = 160;

function textProblem(kind: NoticeKind, part: "title" | "body", text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  const def = noticeDef(kind);
  const max = part === "title" ? TITLE_MAX : BODY_MAX;
  if (value.length > max) return `${def.label}: keep the ${part} to ${max} characters.`;
  // A text may leave out a value, but cannot use one the app does not have.
  const known = valuesIn(`${def.title} ${def.body}`);
  const unknown = valuesIn(value).filter((name) => !known.includes(name));
  if (unknown.length) return `${def.label}: {${unknown[0]}} is not a value here.${known.length ? ` Use ${known.map((name) => `{${name}}`).join(", ")}.` : ""}`;
  return null;
}

export function noticeIssues(book: Pick<DriverNoticeBook, "kinds" | "limits">): string[] {
  const issues: string[] = [];
  for (const def of NOTICE_KINDS) {
    for (const { id: lang } of NOTICE_LANGS) {
      const text = book.kinds[def.kind].texts[lang];
      for (const part of ["title", "body"] as const) {
        const problem = textProblem(def.kind, part, text?.[part] ?? "");
        if (problem) issues.push(problem);
      }
    }
  }
  for (const [country, limits] of Object.entries(book.limits)) {
    if (limits.promoPerDay.on && (!Number.isInteger(limits.promoPerDay.max) || limits.promoPerDay.max < 1 || limits.promoPerDay.max > 10)) issues.push(`${country}: a driver can get 1 to 10 promo messages a day.`);
    if (limits.quiet.on && (!/^\d{2}:\d{2}$/.test(limits.quiet.from) || !/^\d{2}:\d{2}$/.test(limits.quiet.to) || limits.quiet.from === limits.quiet.to)) issues.push(`${country}: quiet hours need a start and a different end, as HH:MM.`);
  }
  return [...new Set(issues)];
}

const langLabel = (lang: NoticeLang) => NOTICE_LANGS.find((item) => item.id === lang)!.label;

/** "Exclusive offer: off", "High demand: Swedish title “Mycket att göra i {area}”", "SE: promo messages 2 → 3 a day". */
export function noticeChanges(before: Pick<DriverNoticeBook, "kinds" | "limits">, after: Pick<DriverNoticeBook, "kinds" | "limits">): string[] {
  const lines: string[] = [];
  for (const def of NOTICE_KINDS) {
    const a = before.kinds[def.kind];
    const b = after.kinds[def.kind];
    if (a.on !== b.on) lines.push(`${def.label}: ${b.on ? "on" : "off"}`);
    if (a.island !== b.island) lines.push(`${def.label}: island popup ${b.island ? "on" : "off"}`);
    if (a.offline !== b.offline) lines.push(`${def.label}: ${b.offline ? "reaches offline drivers" : "only drivers who are online"}`);
    for (const { id: lang } of NOTICE_LANGS) {
      for (const part of ["title", "body"] as const) {
        const was = a.texts[lang]?.[part]?.trim() ?? "";
        const now = b.texts[lang]?.[part]?.trim() ?? "";
        if (was !== now) lines.push(`${def.label}: ${langLabel(lang)} ${part} ${now ? `“${now}”` : "back to the default"}`);
      }
    }
  }
  for (const country of Object.keys(after.limits) as MarketId[]) {
    const a = before.limits[country];
    const b = after.limits[country];
    if (a.promoPerDay.on !== b.promoPerDay.on) lines.push(`${country}: daily promo limit ${b.promoPerDay.on ? "on" : "off"}`);
    if (a.promoPerDay.max !== b.promoPerDay.max) lines.push(`${country}: promo messages ${a.promoPerDay.max} → ${b.promoPerDay.max} a day`);
    if (a.quiet.on !== b.quiet.on || a.quiet.from !== b.quiet.from || a.quiet.to !== b.quiet.to) lines.push(`${country}: quiet hours ${b.quiet.on ? `${b.quiet.from}–${b.quiet.to}` : "off"}`);
  }
  return lines;
}

/** Inside quiet hours at this local time (HH:MM)? */
export function inQuiet(limits: NoticeLimits, time: string): boolean {
  if (!limits.quiet.on) return false;
  const { from, to } = limits.quiet;
  return from <= to ? time >= from && time < to : time >= from || time < to;
}

/** When a message of this kind goes out if it is sent now. */
export function deliveryLine(kind: NoticeKind, limits: NoticeLimits, time: string): string {
  if (limitOf(kind) === "always") return tr("Always goes through, also in quiet hours.");
  if (inQuiet(limits, time)) return tr("Quiet hours now: it goes out at {0}.", [limits.quiet.to]);
  return tr("Goes out now.");
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

/** Demo: about two drivers in three are online now. */
export function isOnlineNow(driverId: string): boolean {
  return hash(`online:${driverId}`) % 3 !== 0;
}

export type Target = { zoneId: string; groupDriverIds: string[] | null; reach: NoticeReach };

/** The drivers a demand or event message reaches. */
export function targetDrivers<T extends { id: string; zoneId: string }>(drivers: readonly T[], target: Target): T[] {
  return drivers.filter((row) => row.zoneId === target.zoneId
    && (!target.groupDriverIds || target.groupDriverIds.includes(row.id))
    && (target.reach === "all" || (target.reach === "online") === isOnlineNow(row.id)));
}

/** Promo messages a driver already got today (country day). */
export function promoToday(book: DriverNoticeBook, driverId: string, day: string): number {
  return book.sent.filter((item) => item.at.slice(0, 10) === day && item.driverIds.includes(driverId)).length;
}

export type SendInput = { kind: "highDemand" | "event"; country: MarketId; zoneId: string; area: NoticeArea; groupId: string | null; reach: NoticeReach; title: string; body: string; driverIds: string[] };

/** Send a demand or event message. Drivers over today's promo limit are left out; in quiet hours it waits. */
export function sendNotice(book: DriverNoticeBook, input: SendInput, actorId: string, nowIso: string, localTime: string): { book: DriverNoticeBook; sent?: SentNotice; error?: string } {
  if (!book.kinds[input.kind].on) return { book, error: `${noticeDef(input.kind).label} is off. Turn it on first.` };
  if (!input.title.trim()) return { book, error: "Write a title." };
  if (input.title.trim().length > TITLE_MAX || input.body.trim().length > BODY_MAX) return { book, error: `Keep the title to ${TITLE_MAX} and the text to ${BODY_MAX} characters.` };
  if (!(input.area.radiusKm >= 0.5 && input.area.radiusKm <= 30)) return { book, error: "The area must be 0.5 to 30 km wide." };
  const limits = book.limits[input.country];
  const day = nowIso.slice(0, 10);
  if (!input.driverIds.length) return { book, error: "No driver matches. Pick another zone, group or drivers." };
  const pool = book.kinds[input.kind].offline ? input.driverIds : input.driverIds.filter((id) => isOnlineNow(id));
  if (!pool.length) return { book, error: `${noticeDef(input.kind).label} does not reach offline drivers. Turn on “Also offline” first.` };
  const allowed = limits.promoPerDay.on ? pool.filter((id) => promoToday(book, id, day) < limits.promoPerDay.max) : pool;
  if (!allowed.length) return { book, error: "Every driver here already got today's promo messages." };
  const sent: SentNotice = {
    id: `DN-${book.sent.length + 1}-${hash(nowIso + input.title) % 10_000}`,
    at: nowIso, by: actorId, kind: input.kind, country: input.country, zoneId: input.zoneId, area: input.area, groupId: input.groupId, reach: input.reach,
    title: input.title.trim(), body: input.body.trim(), driverIds: allowed, skipped: input.driverIds.length - allowed.length,
    sendsAt: inQuiet(limits, localTime) ? limits.quiet.to : null,
  };
  return { book: { ...book, draftRev: book.draftRev + 1, sent: [sent, ...book.sent].slice(0, 200) }, sent };
}

/** What the driver app reads: kinds that are off (DriverNoticeRules.off), the switches, the texts and the limits. */
export function driverAppNotices(book: DriverNoticeBook, country: MarketId) {
  return {
    off: NOTICE_KINDS.filter((def) => !book.kinds[def.kind].on).map((def) => def.kind),
    island: Object.fromEntries(NOTICE_KINDS.map((def) => [def.kind, book.kinds[def.kind].island])),
    offline: Object.fromEntries(NOTICE_KINDS.map((def) => [def.kind, book.kinds[def.kind].offline])),
    texts: Object.fromEntries(NOTICE_LANGS.map(({ id: lang }) => [lang, Object.fromEntries(NOTICE_KINDS.flatMap((def) => {
      const text = book.kinds[def.kind].texts[lang];
      const out: Partial<NoticeText> = {};
      if (text?.title?.trim()) out.title = text.title.trim();
      if (text?.body?.trim()) out.body = text.body.trim();
      return Object.keys(out).length ? [[def.kind, out]] : [];
    }))])),
    limits: { promoPerDay: book.limits[country].promoPerDay.on ? book.limits[country].promoPerDay.max : null, quiet: book.limits[country].quiet.on ? { from: book.limits[country].quiet.from, to: book.limits[country].quiet.to } : null, alwaysThrough: NOTICE_KINDS.filter((def) => limitOf(def.kind) === "always").map((def) => def.kind) },
  };
}
