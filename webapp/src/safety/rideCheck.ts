import { tr, trx } from "../i18n/core.ts";
/**
 * Ride check: the "Is everything OK?" card the driver and rider apps show when a trip looks wrong.
 * The apps send every check with both answers. Tapping a red row (accident, someone hurt, I feel
 * unsafe) sends an alert to admin and opens a "Ride check" incident; any later "Yes" or "Not sure"
 * updates that alert. The admin side only reads checks; it stores who opened an alert.
 */

export const RIDE_CHECK_KEY = "rideCheckOps";

export type Trigger = "far" | "stop" | "route" | "longer" | "crash";

export const TRIGGERS: { id: Trigger; label: string }[] = [
  { id: "far", label: "Dropped far away" },
  { id: "stop", label: "Long stop" },
  { id: "route", label: "Off the route" },
  { id: "longer", label: "Longer than expected" },
  { id: "crash", label: "Possible crash" },
];

export type Person = "driver" | "rider";

export type ChoiceId =
  | "ok" | "call112"
  | "accident" | "hurt" | "unsafe"
  | "car" | "broke_down" | "traffic" | "other"
  | "rider_stop" | "rider_here" | "rider_dest" | "road_closed" | "rider_route"
  | "wrong_place" | "asked_leave";

/** What each row says in the driver app and in the rider app. Red rows send an alert at once. */
export const CHOICES: Record<ChoiceId, { driver: string; rider: string; red?: boolean }> = {
  ok: { driver: "I'm OK", rider: "I'm OK" },
  call112: { driver: "Called 112", rider: "Called 112" },
  accident: { driver: "Accident or collision", rider: "There was an accident", red: true },
  hurt: { driver: "Someone is hurt or feels ill", rider: "Someone is hurt or feels ill", red: true },
  unsafe: { driver: "I feel unsafe", rider: "I feel unsafe", red: true },
  car: { driver: "Car problem", rider: "Car problem" },
  broke_down: { driver: "The car broke down", rider: "The car broke down" },
  traffic: { driver: "Traffic or road works", rider: "Traffic or road works" },
  other: { driver: "Something else", rider: "Something else" },
  rider_stop: { driver: "The rider asked for a stop", rider: "I asked the driver to stop" },
  rider_here: { driver: "The rider asked to stop here", rider: "I asked to stop here" },
  rider_dest: { driver: "The rider changed destination", rider: "I changed destination" },
  road_closed: { driver: "Road closed or no access", rider: "Road closed or no access" },
  rider_route: { driver: "The rider asked for another route", rider: "I asked for this route" },
  wrong_place: { driver: "The rider was left at the wrong place", rider: "I was left at the wrong place" },
  asked_leave: { driver: "Asked the rider to leave the car", rider: "The driver asked me to leave the car" },
};

export type QuestionId = "anyone_hurt" | "car_safe" | "other_ok" | "who_help" | "in_danger" | "can_continue";

export const QUESTIONS: Record<QuestionId, string> = {
  anyone_hurt: "Is anyone hurt?",
  car_safe: "Is the car in a safe place?",
  other_ok: "Is the other person OK?",
  who_help: "Who needs help?",
  in_danger: "Are you in danger right now?",
  can_continue: "Can you continue the trip?",
};

export type FollowUp = { q: QuestionId; a: string; at: string };
export type Answer = { at: string; choice: ChoiceId; follow?: FollowUp[]; text?: string };

/** How a check ended, the most serious of the two answers. */
export type Outcome = "help" | "call112" | "reason" | "ok" | "none";

export const OUTCOMES: { id: Outcome; label: string }[] = [
  { id: "ok", label: "I'm OK" },
  { id: "reason", label: "Gave a reason" },
  { id: "help", label: "Alert sent" },
  { id: "call112", label: "Called 112" },
  { id: "none", label: "No answer yet" },
];

export type RideCheck = {
  id: string;
  /** The rider, so the check is found like the other records. */
  name: string;
  phone: string;
  zoneId: string;
  status: Outcome;
  tripId: string;
  driverId: string;
  riderId: string;
  vehicleId: string | null;
  trigger: Trigger;
  /** What the trigger measured: metres from the drop-off, minutes stopped, km off the route, % longer; null = not measured. */
  value: number | null;
  place: string;
  /** When the card opened in both apps. */
  at: string;
  driver: Answer | null;
  rider: Answer | null;
  /** The "Ride check" incident, when an alert was sent. */
  incidentId: string | null;
  /** Demo only: the trip is still going, so the check happened just now. */
  live?: boolean;
};

export function triggerLabel(trigger: Trigger): string {
  return trx(TRIGGERS.find((item) => item.id === trigger)?.label ?? trigger);
}

export function distanceText(metres: number): string {
  return metres >= 1000 ? `${Math.round(metres / 100) / 10} km` : `${Math.round(metres)} m`;
}

/** The reason line the card shows, e.g. "Stopped for 4 min · Odenplan". */
export function reasonText(check: Pick<RideCheck, "trigger" | "value" | "place">): string {
  const at = check.place ? ` · ${check.place}` : "";
  // G7 live fix: no measured number (never a made-up "0 min" / "0 km").
  if (check.value === null) return triggerLabel(check.trigger) + at;
  if (check.trigger === "far") return tr("Trip ended {0} from the drop-off", [distanceText(check.value)]) + at;
  if (check.trigger === "stop") return tr("Stopped for {0} min", [check.value]) + at;
  if (check.trigger === "route") return tr("{0} km off the route", [check.value]) + at;
  if (check.trigger === "longer") return tr("Trip {0}% longer than expected", [check.value]) + at;
  return tr("Very hard stop") + at;
}

export function choiceLabel(who: Person, choice: ChoiceId): string {
  return trx(CHOICES[choice]?.[who] ?? choice);
}

export function answerLabel(who: Person, answer: Answer | null): string {
  return answer ? choiceLabel(who, answer.choice) : tr("No answer yet");
}

export function isRed(answer: Answer | null): boolean {
  return Boolean(answer && CHOICES[answer.choice]?.red);
}

/** A follow-up answer an admin should look at: someone hurt, in danger, not safe or not sure. */
export function worrying(follow: FollowUp): boolean {
  if (follow.q === "anyone_hurt") return follow.a === "Yes" || follow.a === "Not sure";
  if (follow.q === "other_ok") return follow.a === "No" || follow.a === "Not sure";
  if (follow.q === "car_safe") return follow.a === "No";
  if (follow.q === "in_danger") return follow.a === "Yes";
  if (follow.q === "who_help") return true;
  return false;
}

export function followText(follow: FollowUp): string {
  return `${trx(QUESTIONS[follow.q] ?? follow.q)} ${trx(follow.a)}`;
}

export function answerKind(answer: Answer | null): Outcome {
  if (!answer) return "none";
  if (isRed(answer)) return "help";
  if (answer.choice === "call112") return "call112";
  if (answer.choice === "ok") return "ok";
  return "reason";
}

const RANK: Record<Outcome, number> = { none: 0, ok: 1, reason: 2, call112: 3, help: 4 };

export function outcomeOf(check: Pick<RideCheck, "driver" | "rider">): Outcome {
  const a = answerKind(check.driver);
  const b = answerKind(check.rider);
  return RANK[a] >= RANK[b] ? a : b;
}

export function outcomeLabel(outcome: Outcome): string {
  return OUTCOMES.find((item) => item.id === outcome)?.label ?? outcome;
}

/** The alert rule: a red row from the driver or the rider. */
export function isAlert(check: Pick<RideCheck, "driver" | "rider">): boolean {
  return isRed(check.driver) || isRed(check.rider);
}

/** Who sent the alert first, and with which answer. */
export function alertBy(check: Pick<RideCheck, "driver" | "rider">): { who: Person; answer: Answer } | null {
  const red = (["driver", "rider"] as const)
    .flatMap((who) => (isRed(check[who]) ? [{ who, answer: check[who]! }] : []))
    .sort((a, b) => a.answer.at.localeCompare(b.answer.at));
  return red[0] ?? null;
}

/** Follow-up answers that update the alert, from both people, in time order. */
export function worries(check: Pick<RideCheck, "driver" | "rider">): { who: Person; follow: FollowUp }[] {
  return (["driver", "rider"] as const)
    .flatMap((who) => (check[who]?.follow ?? []).filter(worrying).map((follow) => ({ who, follow })))
    .sort((a, b) => a.follow.at.localeCompare(b.follow.at));
}

/** The alert's first line, e.g. "Accident or collision (driver)". */
export function alertTitle(check: Pick<RideCheck, "driver" | "rider">): string {
  const first = alertBy(check);
  if (!first) return tr("Ride check");
  return `${choiceLabel(first.who, first.answer.choice)} (${trx(first.who)})`;
}

/* ------------------------------------------------------------------ demo clock */

/**
 * Demo only. A check on a trip that is still going happened just now: its times follow the
 * incident's opening time, like an open SOS, or the demo clock when there is no incident.
 * Other checks keep their own times, which match the trip's timeline.
 */
export function shiftOf(check: Pick<RideCheck, "live" | "driver" | "rider">, openedAt: number | null, demoShiftMs: number): number {
  if (!check.live) return 0;
  const first = alertBy(check);
  if (openedAt !== null && first) return openedAt - Date.parse(first.answer.at);
  return demoShiftMs;
}

export function shifted(iso: string, shift: number): number {
  return Date.parse(iso) + shift;
}

/* ------------------------------------------------------------------ the log */

export type LogFilter = { trigger: Trigger | ""; answer: Outcome | ""; zoneId: string; driverId: string; from: string; to: string };

export const EMPTY_FILTER: LogFilter = { trigger: "", answer: "", zoneId: "", driverId: "", from: "", to: "" };

/** Checks that match the filter. `day` turns a time into YYYY-MM-DD in the country's time zone. */
export function filterChecks<T extends RideCheck>(checks: readonly T[], filter: LogFilter, timeOf: (check: T) => number, day: (ms: number) => string): T[] {
  return checks.filter((check) => {
    if (filter.trigger && check.trigger !== filter.trigger) return false;
    if (filter.answer && outcomeOf(check) !== filter.answer) return false;
    if (filter.zoneId && check.zoneId !== filter.zoneId) return false;
    if (filter.driverId && check.driverId !== filter.driverId) return false;
    const on = day(timeOf(check));
    if (filter.from && on < filter.from) return false;
    if (filter.to && on > filter.to) return false;
    return true;
  });
}

/** Drivers and zones with more than one check, most first, so repeats stand out. */
export function repeats(checks: readonly RideCheck[]): { drivers: { id: string; count: number }[]; zones: { id: string; count: number }[] } {
  const count = (key: (check: RideCheck) => string) => {
    const map = new Map<string, number>();
    for (const check of checks) map.set(key(check), (map.get(key(check)) ?? 0) + 1);
    return [...map.entries()].filter(([, value]) => value > 1).map(([id, value]) => ({ id, count: value })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  };
  return { drivers: count((check) => check.driverId), zones: count((check) => check.zoneId) };
}

/** Checks from the records list; anything that is not a check is left out. */
export function asRideChecks(rows: readonly unknown[] | undefined): RideCheck[] {
  return (rows ?? []).filter((row): row is RideCheck => {
    const item = row as Partial<RideCheck> | null;
    return Boolean(item && typeof item.id === "string" && typeof item.at === "string" && TRIGGERS.some((trigger) => trigger.id === item.trigger));
  });
}

/* ------------------------------------------------------------------ who opened an alert */

export type RideCheckOps = { draftRev: number; opened: Record<string, { by: string; at: string }> };

export function emptyRideCheckOps(): RideCheckOps {
  return { draftRev: 1, opened: {} };
}

export function normalizeRideCheckOps(value: unknown): RideCheckOps {
  if (!value || typeof value !== "object") return emptyRideCheckOps();
  const raw = value as Partial<RideCheckOps>;
  return {
    draftRev: typeof raw.draftRev === "number" && raw.draftRev > 0 ? raw.draftRev : 1,
    opened: raw.opened && typeof raw.opened === "object" && !Array.isArray(raw.opened) ? raw.opened : {},
  };
}

/** The first admin who opens an alert stops the red banner for everyone. */
export function openCheck(ops: RideCheckOps, id: string, by: string, at: string): RideCheckOps {
  if (ops.opened[id]) return ops;
  return { ...ops, draftRev: ops.draftRev + 1, opened: { ...ops.opened, [id]: { by, at } } };
}
