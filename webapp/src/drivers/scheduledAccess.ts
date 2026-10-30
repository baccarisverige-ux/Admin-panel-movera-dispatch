import type { ReservationRules } from "../dispatch/rules.ts";
import { tr } from "../i18n/core.ts";

/**
 * Scheduled rides access per driver (Round 3, Q11). An admin can turn scheduled rides on or off for one driver,
 * for some days, until a date, or always. Without that, the late-cancel rule in Dispatch › Reservations decides:
 * too many late cancels in the period pause scheduled rides for a while.
 */

export const SCHEDULED_ACCESS_KEY = "scheduledAccess";

export type AccessPeriod = "days" | "until" | "always";
export type AccessChoice = { on: boolean; period: AccessPeriod; days: number; until: string };
export type AccessEntry = AccessChoice & { driverId: string; from: string; by: string };
export type AccessLog = { driverId: string; line: string; by: string; at: string };
export type AccessBook = { draftRev: number; drivers: Record<string, AccessEntry>; log: AccessLog[] };

/** A cancel of an accepted scheduled ride less than the late-cancel time before pickup. */
export type LateCancel = { id: string; at: string; reservationId: string; minutesBefore: number; reason: string };

export type LateRule = Pick<ReservationRules, "latePause" | "latePauseAfter" | "latePeriodDays" | "latePauseDays" | "driverLateCancelHours">;

const DAY = 86_400_000;

export const ACCESS_PERIODS: { id: AccessPeriod; label: string }[] = [
  { id: "days", label: "For some days" },
  { id: "until", label: "Until a date" },
  { id: "always", label: "Always" },
];

export function emptyAccessBook(): AccessBook {
  return { draftRev: 1, drivers: {}, log: [] };
}

export function normalizeAccessBook(value: unknown): AccessBook {
  if (!value || typeof value !== "object") return emptyAccessBook();
  const raw = value as Partial<AccessBook>;
  return {
    draftRev: typeof raw.draftRev === "number" && raw.draftRev > 0 ? raw.draftRev : 1,
    drivers: raw.drivers && typeof raw.drivers === "object" ? raw.drivers : {},
    log: Array.isArray(raw.log) ? raw.log : [],
  };
}

function seedOf(driverId: string): number {
  return Number(driverId.replace(/\D/g, "")) || 1;
}

const LATE_REASONS = ["I can no longer make the pickup time", "Personal emergency", "Pickup is too far from me", "Trip details no longer work for me"];

/**
 * Demo late cancels, counted back from now so the current period always has some:
 * every 6th driver has 2 this week (paused by the default rule), others 1 or 1 long ago.
 */
export function lateCancelsFor(driverId: string, nowMs: number): LateCancel[] {
  const seed = seedOf(driverId);
  const ago = (days: number, hours: number) => new Date(nowMs - days * DAY - hours * 3_600_000).toISOString();
  const make = (index: number, days: number, hours: number): LateCancel => ({
    id: `${driverId}-late-${index}`,
    at: ago(days, hours),
    reservationId: `B${String(((seed * 7 + index * 11) % 40) + 1).padStart(3, "0")}`,
    minutesBefore: 15 + ((seed + index * 13) % 40),
    reason: LATE_REASONS[(seed + index) % LATE_REASONS.length],
  });
  if (seed % 6 === 0) return [make(1, 1, 3), make(2, 3, 5)];
  if (seed % 6 === 3) return [make(1, 2, 2)];
  if (seed % 10 === 7) return [make(1, 12, 1)];
  return [];
}

/** When an admin's choice ends, in ms. Null: it never ends. */
export function entryEnd(entry: AccessChoice & { from: string }): number | null {
  if (entry.period === "always") return null;
  if (entry.period === "until") return Date.parse(`${entry.until}T23:59:59`);
  return Date.parse(entry.from) + Math.max(1, entry.days) * DAY;
}

export type AccessState = {
  /** The driver can get scheduled rides now. */
  allowed: boolean;
  /** admin: an admin's choice is in force; rule: paused by too many late cancels; normal: the rule allows it. */
  source: "admin" | "rule" | "normal";
  /** When the current state ends, or null when it does not end by itself. */
  until: number | null;
  lateInPeriod: LateCancel[];
  /** The late-cancel rule pauses this driver now (even when an admin turned scheduled rides on). */
  pausedByRule: boolean;
  ruleUntil: number | null;
};

/** Where a driver's access to scheduled rides stands now. An admin's choice wins over the late-cancel rule while it lasts. */
export function accessState(entry: AccessEntry | undefined, lateCancels: readonly LateCancel[], rule: LateRule, nowMs: number): AccessState {
  const lateInPeriod = lateCancels.filter((item) => Date.parse(item.at) >= nowMs - rule.latePeriodDays * DAY).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  let pausedByRule = false;
  let ruleUntil: number | null = null;
  if (rule.latePause) {
    // A pause starts with the late cancel that reached the limit and lasts its days, even when older cancels leave the period.
    const times = lateCancels.map((item) => Date.parse(item.at)).filter((at) => at <= nowMs).sort((a, b) => a - b);
    for (const at of times) {
      const count = times.filter((other) => other <= at && other > at - rule.latePeriodDays * DAY).length;
      const end = at + rule.latePauseDays * DAY;
      if (count >= rule.latePauseAfter && end > nowMs && (ruleUntil === null || end > ruleUntil)) {
        pausedByRule = true;
        ruleUntil = end;
      }
    }
  }
  const end = entry ? entryEnd(entry) : null;
  const adminActive = Boolean(entry && (end === null || end > nowMs));
  if (entry && adminActive) return { allowed: entry.on, source: "admin", until: end, lateInPeriod, pausedByRule, ruleUntil };
  if (pausedByRule) return { allowed: false, source: "rule", until: ruleUntil, lateInPeriod, pausedByRule, ruleUntil };
  return { allowed: true, source: "normal", until: null, lateInPeriod, pausedByRule, ruleUntil };
}

/**
 * Owner decision 2 (contract v0.4.2): the admin's choice for one driver as the driver app reads it, `Driver.scheduledRides`
 * on GET /driver/profile (CONTRACT.md §6.1). Null while no choice is in force: the zone switch and the late-cancel rule decide.
 * Off: no new reservations until `until` (null = until an admin turns them on). Reservations already accepted always stay.
 */
export function driverScheduledRides(entry: AccessEntry | undefined, nowMs: number): { on: boolean; until: string | null } | null {
  if (!entry) return null;
  const end = entryEnd(entry);
  if (end !== null && end <= nowMs) return null;
  return { on: entry.on, until: end === null ? null : new Date(end).toISOString() };
}

const dateLabel = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** "Scheduled rides on", "Paused until 2026-10-21 (2 late cancels in 7 days)", "Off until 2026-10-22 (set by nora)". */
export function accessLabel(state: AccessState, entry: AccessEntry | undefined, rule: LateRule): string {
  // Owner G2c: in the admin's language (sv/fr/en); the panel shows it as it is.
  if (state.source === "admin" && entry) {
    const by = entry.by;
    const text = state.until === null
      ? (entry.on ? tr("On always, set by {0}", [by]) : tr("Off always, set by {0}", [by]))
      : (entry.on ? tr("On until {0}, set by {1}", [dateLabel(state.until), by]) : tr("Off until {0}, set by {1}", [dateLabel(state.until), by]));
    return entry.on && state.pausedByRule ? `${text}${tr(". The late-cancel pause is skipped")}` : text;
  }
  if (state.source === "rule") return tr("Paused until {0}: {1} late cancels in {2} days", [dateLabel(state.until!), state.lateInPeriod.length, rule.latePeriodDays]);
  return tr("Scheduled rides on");
}

export function choiceError(choice: AccessChoice, nowMs: number): string | null {
  if (choice.period === "days" && (!Number.isInteger(choice.days) || choice.days < 1 || choice.days > 365)) return "Choose 1 to 365 days.";
  if (choice.period === "until") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(choice.until)) return "Pick the last day.";
    if (Date.parse(`${choice.until}T23:59:59`) <= nowMs) return "The last day must be in the future.";
  }
  return null;
}

function describe(choice: AccessChoice): string {
  const period = choice.period === "always" ? "always" : choice.period === "until" ? `until ${choice.until}` : `for ${choice.days} day${choice.days === 1 ? "" : "s"}`;
  return `Scheduled rides ${choice.on ? "on" : "off"} ${period}`;
}

/** Save an admin's choice for one driver. */
export function setAccess(book: AccessBook, driverId: string, choice: AccessChoice, actorId: string, nowIso: string): { book: AccessBook; error?: string } {
  const error = choiceError(choice, Date.parse(nowIso));
  if (error) return { book, error };
  const entry: AccessEntry = { ...choice, driverId, from: nowIso, by: actorId };
  return {
    book: {
      draftRev: book.draftRev + 1,
      drivers: { ...book.drivers, [driverId]: entry },
      log: [{ driverId, line: describe(choice), by: actorId, at: nowIso }, ...book.log].slice(0, 200),
    },
  };
}

/** Remove the admin's choice: the late-cancel rule decides again. */
export function clearAccess(book: AccessBook, driverId: string, actorId: string, nowIso: string): AccessBook {
  const drivers = { ...book.drivers };
  delete drivers[driverId];
  return { draftRev: book.draftRev + 1, drivers, log: [{ driverId, line: "Back to the late-cancel rule", by: actorId, at: nowIso }, ...book.log].slice(0, 200) };
}
