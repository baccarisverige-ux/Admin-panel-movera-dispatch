import type { DemoRecord, LiveRideCheck } from "../api/seed.ts";
import type { LatLng } from "../dashboard/route.ts";
import { market, marketOfZone, zoneById, type MarketId } from "../markets/markets.ts";
import type { IncidentEvent, SafetyBook } from "./ops.ts";
import { tr, trx } from "../i18n/core.ts";

/**
 * Incidents as cases: a level, time limits per level, where the people are, the linked trip
 * and earlier cases of the same person. Take, contact and resolve stay in the safety book,
 * so Alerts and Incidents always agree on who owns an SOS.
 */

export const INCIDENT_OPS_KEY = "incidentOps";

export type Level = "low" | "high" | "critical";
export type Kind = "sos" | "car_lost" | "ride_check" | "accident" | "harassment" | "route" | "lost" | "other";

export const LEVELS: { id: Level; label: string; help: string }[] = [
  { id: "critical", label: "Critical", help: "Someone is in danger now: SOS, accident, violence." },
  { id: "high", label: "High", help: "Someone may be hurt or feels unsafe." },
  { id: "low", label: "Low", help: "No one is in danger: lost item, rude words, a wrong route." },
];

export const KINDS: { id: Kind; label: string; level: Level }[] = [
  { id: "sos", label: "SOS button", level: "critical" },
  // Safety part 1 (2026-10-27): the rider is on board and the server has no car position for 30 min.
  { id: "car_lost", label: "Car lost", level: "critical" },
  { id: "ride_check", label: "Ride check", level: "critical" },
  { id: "accident", label: "Accident", level: "critical" },
  { id: "harassment", label: "Harassment or threat", level: "high" },
  { id: "route", label: "Strange route or stop", level: "high" },
  { id: "lost", label: "Lost item", level: "low" },
  { id: "other", label: "Other", level: "low" },
];

export type Limit = { takeMin: number; solveMin: number };
export type Emergency = { label: string; number: string };

export type IncidentSettings = {
  limits: Record<Level, Limit>;
  /** An alert when a case is not taken or not solved in time. */
  lateAlerts: boolean;
  callButtons: boolean;
  liveMap: boolean;
  pastCases: boolean;
  caseReport: boolean;
  emergency: Record<MarketId, Emergency[]>;
};

export type CaseInfo = { level?: Level; levelBy?: string; levelAt?: string; levelWhy?: string };
export type CallLog = { id: string; incidentId: string; at: string; actorId: string; to: string };

export type IncidentOps = { draftRev: number; settings: IncidentSettings; cases: Record<string, CaseInfo>; calls: CallLog[] };

export function defaultIncidentSettings(): IncidentSettings {
  return {
    limits: { critical: { takeMin: 2, solveMin: 30 }, high: { takeMin: 10, solveMin: 120 }, low: { takeMin: 60, solveMin: 1440 } },
    lateAlerts: true,
    callButtons: true,
    liveMap: true,
    pastCases: true,
    caseReport: true,
    emergency: {
      SE: [{ label: "Emergency (police, ambulance, fire)", number: "112" }, { label: "Police, not urgent", number: "114 14" }],
      FR: [{ label: "Emergency (all)", number: "112" }, { label: "Police", number: "17" }, { label: "Ambulance (SAMU)", number: "15" }],
      TN: [{ label: "Police", number: "197" }, { label: "Ambulance (SAMU)", number: "190" }, { label: "Fire", number: "198" }],
    },
  };
}

export function emptyIncidentOps(): IncidentOps {
  return { draftRev: 1, settings: defaultIncidentSettings(), cases: {}, calls: [] };
}

export function normalizeIncidentOps(value: unknown): IncidentOps {
  const base = emptyIncidentOps();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<IncidentOps>;
  const settings = (raw.settings ?? {}) as Partial<IncidentSettings>;
  return {
    draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1,
    settings: {
      ...base.settings,
      ...settings,
      limits: { ...base.settings.limits, ...(settings.limits ?? {}) },
      emergency: { ...base.settings.emergency, ...(settings.emergency ?? {}) },
    },
    cases: raw.cases && typeof raw.cases === "object" ? raw.cases : {},
    calls: Array.isArray(raw.calls) ? raw.calls : [],
  };
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

export type CaseState = "new" | "taken" | "solved";

/** The case steps the owner named (2026-10-27): New, Taken, Solved, False alarm. */
export function caseStep(status: string): string {
  if (status === "queued" || status === "open") return tr("New");
  if (status === "taken" || status === "investigating") return tr("Taken");
  if (status === "dismissed") return tr("False alarm");
  return tr("Solved");
}

/** A phone's or a car's position the server sent with the case (live). */
export type CasePosition = { lat: number; lng: number; at: string | null };

export type Case = {
  id: string;
  zoneId: string;
  country: MarketId;
  who: string;
  phone: string;
  raisedBy: "rider" | "driver" | "system";
  kind: Kind;
  level: Level;
  state: CaseState;
  status: string;
  owner: string | null;
  openedAt: number;
  takenAt: number | null;
  solvedAt: number | null;
  driverId: string | null;
  /** The trip the case is about, when the incident names it (Ride check). */
  tripId: string | null;
  events: IncidentEvent[];
  /** Live: the GPS the SOS phone sent, and the car's latest position. */
  phoneAt: CasePosition | null;
  carAt: CasePosition | null;
  /** Live: nobody took it in 2 minutes, so every signed-in admin was alerted. */
  escalatedAt: string | null;
  falseAlarm: boolean;
  /** Live Ride check (contract v0.12.0 §22): trigger, who, answer, from the server. */
  rideCheck?: LiveRideCheck;
};

const OPEN = new Set(["queued", "taken"]);
const LIVE_KINDS = new Set<Kind>(["sos", "car_lost"]);

/** A "Ride check" incident: opened by itself when the driver or rider app sends a ride check alert. */
export function isRideCheckIncident(row: Pick<DemoRecord, "kind">): boolean {
  return row.kind === "ride_check";
}

export function kindOf(row: DemoRecord, handledLive = false): Kind {
  if (isRideCheckIncident(row)) return "ride_check";
  // Live: the server names the kind.
  if (row.kind && LIVE_KINDS.has(row.kind as Kind)) return row.kind as Kind;
  // An SOS stays an SOS after it is solved.
  if (OPEN.has(row.status) || handledLive) return "sos";
  const order: Kind[] = ["accident", "harassment", "route", "lost", "other", "sos"];
  return order[hash(row.id) % order.length];
}

/** One case from the incident record, the safety book and the case settings. */
export function caseOf(row: DemoRecord, safety: SafetyBook, ops: IncidentOps, now: number): Case {
  const record = safety.incidents[row.id];
  const events = record?.events ?? [];
  const take = events.find((event) => event.kind === "take");
  const resolve = events.find((event) => event.kind === "resolve" || event.kind === "dismiss");
  const open = OPEN.has(row.status);
  const kind = kindOf(row, events.length > 0);
  const level = ops.cases[row.id]?.level ?? KINDS.find((item) => item.id === kind)?.level ?? "low";
  const seed = hash(row.id);
  const takenAt = take ? Date.parse(take.at) : null;
  // Same opening time as the SOS alert: two minutes before it was taken, or a few minutes ago.
  const openedAt = row.createdAt ? Date.parse(row.createdAt) : row.live ? NaN : takenAt ? takenAt - 2 * 60_000 : open ? now - (2 + (seed % 8)) * 60_000 : now - (1 + (seed % 20)) * 86_400_000 - (seed % 600) * 60_000;
  const demoSolved = !open && !resolve && !row.live ? openedAt + (6 + (seed % 40)) * 60_000 : null;
  return {
    id: row.id,
    zoneId: row.zoneId,
    country: marketOfZone(row.zoneId)?.id ?? "SE",
    who: row.name,
    phone: row.phone,
    raisedBy: row.raisedBy ?? (seed % 3 === 0 ? "driver" : "rider"),
    kind,
    level,
    state: open ? (row.status === "taken" ? "taken" : "new") : "solved",
    status: row.status,
    owner: record?.owner ?? null,
    openedAt,
    takenAt: takenAt ?? (!open ? openedAt + (1 + (seed % 4)) * 60_000 : null),
    solvedAt: resolve ? Date.parse(resolve.at) : demoSolved,
    driverId: row.driverId ?? null,
    tripId: row.tripId ?? null,
    events,
    phoneAt: typeof row.phoneLat === "number" && typeof row.phoneLng === "number" ? { lat: row.phoneLat, lng: row.phoneLng, at: row.phoneAt ?? null } : null,
    carAt: typeof row.carLat === "number" && typeof row.carLng === "number" ? { lat: row.carLat, lng: row.carLng, at: row.carAt ?? null } : null,
    escalatedAt: row.escalatedAt ?? null,
    falseAlarm: row.status === "dismissed",
    ...(row.liveRideCheck ? { rideCheck: row.liveRideCheck } : {}),
  };
}

export type Clock = { label: string; minutes: number; limit: number; late: boolean; done: boolean };

/** Time to take and time to solve, against the limits of the case's level. */
export function clocks(item: Case, settings: IncidentSettings, now: number): { take: Clock; solve: Clock } {
  const limit = settings.limits[item.level];
  const takeEnd = item.takenAt ?? now;
  const solveEnd = item.solvedAt ?? now;
  const takeMin = Math.max(0, Math.round((takeEnd - item.openedAt) / 60_000));
  const solveMin = Math.max(0, Math.round((solveEnd - item.openedAt) / 60_000));
  return {
    take: { label: "Taken", minutes: takeMin, limit: limit.takeMin, late: takeMin > limit.takeMin, done: item.takenAt !== null },
    solve: { label: "Solved", minutes: solveMin, limit: limit.solveMin, late: solveMin > limit.solveMin, done: item.solvedAt !== null },
  };
}

/** The line an alert shows when an open case is late, or null. */
export function lateText(item: Case, settings: IncidentSettings, now: number): string | null {
  if (!settings.lateAlerts || item.state === "solved") return null;
  const time = clocks(item, settings, now);
  if (item.state === "new" && time.take.late) return tr("not taken after {0} min (limit {1})", [time.take.minutes, time.take.limit]);
  if (item.state === "taken" && time.solve.late) return tr("not solved after {0} min (limit {1})", [time.solve.minutes, time.solve.limit]);
  return null;
}

/**
 * Where rider and driver are now. Live: the GPS the SOS phone sent and the car's latest position from the server.
 * Demo: positions near the zone, with how fresh they are.
 */
export function positions(item: Case, now = Date.now()): { rider: LatLng; driver: LatLng | null; secondsAgo: number; live?: boolean } {
  if (item.phoneAt || item.carAt) {
    const point = (p: CasePosition | null): LatLng | null => (p ? [p.lat, p.lng] : null);
    const times = [item.phoneAt?.at, item.carAt?.at].filter((at): at is string => Boolean(at)).map((at) => Date.parse(at));
    const latest = times.length ? Math.max(...times) : now;
    return { rider: point(item.phoneAt) ?? (point(item.carAt) as LatLng), driver: point(item.carAt), secondsAgo: Math.max(0, Math.round((now - latest) / 1000)), live: true };
  }
  const center = zoneById(item.zoneId)?.center ?? market(item.country).center;
  const seed = hash(item.id);
  const dLat = ((seed % 200) - 100) / 20_000;
  const dLng = (((seed >>> 8) % 200) - 100) / 12_000;
  const rider: LatLng = [center[0] + dLat, center[1] + dLng];
  return { rider, driver: item.driverId || item.raisedBy === "driver" ? [rider[0] + 0.0006, rider[1] - 0.0009] : null, secondsAgo: 4 + (seed % 50) };
}

export function sortCases(cases: readonly Case[]): Case[] {
  const rank: Record<Level, number> = { critical: 0, high: 1, low: 2 };
  const state: Record<CaseState, number> = { new: 0, taken: 1, solved: 2 };
  return [...cases].sort((a, b) => state[a.state] - state[b.state] || rank[a.level] - rank[b.level] || (a.state === "solved" ? b.openedAt - a.openedAt : a.openedAt - b.openedAt));
}

export function pastCases(item: Case, all: readonly Case[]): Case[] {
  return all.filter((other) => other.id !== item.id && (other.phone === item.phone || other.who === item.who));
}

/** The trip the case is about: the rider's live trip, or their latest one. */
export function linkedTrip(item: Case, trips: readonly DemoRecord[]): DemoRecord | null {
  const named = item.tripId ? trips.find((trip) => trip.id === item.tripId) : undefined;
  if (named) return named;
  const mine = trips.filter((trip) => trip.name === item.who && trip.zoneId === item.zoneId);
  return mine.find((trip) => ["accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"].includes(trip.status)) ?? mine[0] ?? trips.find((trip) => trip.name === item.who) ?? null;
}

export function setLevel(ops: IncidentOps, id: string, level: Level, actorId: string, why: string, at: string): IncidentOps {
  return { ...ops, draftRev: ops.draftRev + 1, cases: { ...ops.cases, [id]: { ...ops.cases[id], level, levelBy: actorId, levelAt: at, levelWhy: why } } };
}

export function logCall(ops: IncidentOps, incidentId: string, to: string, actorId: string, at: string): IncidentOps {
  return { ...ops, draftRev: ops.draftRev + 1, calls: [...ops.calls, { id: `${incidentId}-call-${ops.calls.length + 1}`, incidentId, at, actorId, to }] };
}

export function settingsError(settings: IncidentSettings): string | null {
  for (const level of LEVELS) {
    const limit = settings.limits[level.id];
    if (!Number.isFinite(limit.takeMin) || limit.takeMin < 1) return tr("{0}: time to take must be at least 1 minute.", [trx(level.label)]);
    if (!Number.isFinite(limit.solveMin) || limit.solveMin < limit.takeMin) return tr("{0}: time to solve must be at least the time to take.", [trx(level.label)]);
  }
  if (settings.limits.critical.takeMin > settings.limits.high.takeMin || settings.limits.high.takeMin > settings.limits.low.takeMin) return tr("A higher level must be taken at least as fast as a lower one.");
  for (const [country, rows] of Object.entries(settings.emergency)) {
    if (rows.some((row) => !row.number.trim() || !row.label.trim())) return tr("{0}: every emergency number needs a name and a number.", [trx(market(country as MarketId).name)]);
  }
  return null;
}

/** A plain-text case report, for printing or attaching to a police report. */
export function caseReport(item: Case, extra: { zone: string; trip: string; owner: string; level: string; events: string[]; calls: string[] }, format: (ms: number) => string): string {
  return [
    tr("Movera incident report {0}", [item.id]),
    tr("Level: {0}", [extra.level]),
    tr("Kind: {0}", [trx(KINDS.find((kind) => kind.id === item.kind)?.label ?? item.kind)]),
    tr("Raised by: {0} ({1})", [item.raisedBy === "rider" ? tr("the rider") : item.raisedBy === "system" ? (item.kind === "ride_check" ? tr("Movera (no answer)") : tr("Movera (car lost)")) : tr("the driver"), item.who]),
    tr("Zone: {0}", [extra.zone]),
    tr("Trip: {0}", [extra.trip]),
    tr("Opened: {0}", [format(item.openedAt)]),
    tr("Taken: {0} by {1}", [item.takenAt ? format(item.takenAt) : tr("not yet"), extra.owner]),
    tr("Solved: {0}", [item.solvedAt ? format(item.solvedAt) : tr("not yet")]),
    "",
    tr("What happened"),
    ...extra.events.map((line) => `- ${line}`),
    "",
    tr("Calls"),
    ...(extra.calls.length ? extra.calls.map((line) => `- ${line}`) : [`- ${tr("none")}`]),
  ].join("\n");
}

/** The app's trigger, as the admin reads it (contract v0.12.0 §22). */
export function liveTriggerLabel(trigger: string): string {
  return trigger === "dropped_far" ? tr("Dropped far from the destination") : trigger === "long_stop" ? tr("Long stop") : trigger === "off_route" ? tr("Off the route") : trigger === "possible_crash" ? tr("Possible crash") : trigger;
}

/** What the Ride check said: "I need help", "No answer in 2 minutes", and a late answer when one came. */
export function liveAnswerLabel(check: LiveRideCheck): string {
  const answer = check.answer === "need_help" ? tr("I need help") : tr("No answer in 2 minutes");
  if (!check.lateAnswer) return answer;
  return `${answer} · ${check.lateAnswer === "ok" ? tr("Late answer: I'm OK") : tr("Late answer: I need help")}`;
}
