import { isLiveData } from "../live/realData.ts";
import type { Role } from "../auth/permissions.ts";
import { csvCell } from "../reports/csv.ts";
import { tr, trx } from "../i18n/core.ts";

/** Alerts: one list of everything that needs an admin, with levels, who gets it, and who works on it. */

export const ALERTS_KEY = "alertOps";

export type Level = "critical" | "important" | "info";
export type GroupId = "safety" | "dispatch" | "drivers" | "money" | "riders" | "system";
export type KindId =
  | "sos" | "sos_slow" | "ride_check" | "car_lost"
  | "long_wait" | "few_drivers" | "no_driver" | "late_reservation"
  | "doc_expiring" | "low_rating" | "auto_offline"
  | "payment_failed" | "refund_approval" | "payout_big"
  | "rider_fraud" | "rider_cancels" | "ticket_open"
  | "system_health"
  | "rule";

export const LEVELS: { id: Level; label: string }[] = [
  { id: "critical", label: "Critical" },
  { id: "important", label: "Important" },
  { id: "info", label: "Info" },
];

export const GROUPS: { id: GroupId; label: string; permission: string }[] = [
  { id: "safety", label: "Safety", permission: "incidents.read" },
  { id: "dispatch", label: "Dispatch", permission: "trips.read" },
  { id: "drivers", label: "Drivers", permission: "drivers.read" },
  { id: "money", label: "Money", permission: "finance.read" },
  { id: "riders", label: "Riders", permission: "riders.read" },
  { id: "system", label: "System", permission: "system.read" },
];

export type Limits = { info: number | null; important: number | null; critical: number | null };

export type KindDef = {
  id: KindId;
  group: GroupId;
  label: string;
  help: string;
  /** "fixed": one level for every alert of this kind. "limits": the level follows a number. */
  mode: "fixed" | "limits";
  /** For limits: "up" means a higher number is worse, "down" means a lower number is worse. */
  direction?: "up" | "down";
  unit?: string;
  level?: Level;
  limits?: Limits;
  /** Settings that live in Dispatch, per zone. */
  fromDispatch?: boolean;
  /** Who may see it, when not only the group's permission: any one of these is enough. */
  anyOf?: string[];
  path: string;
};

export const KINDS: KindDef[] = [
  { id: "sos", group: "safety", label: "SOS from a rider or driver", help: "Taken and solved in Incidents too: one owner for both.", mode: "fixed", level: "critical", path: "/incidents" },
  { id: "car_lost", group: "safety", label: "Car lost", help: "The rider is on board and the car sent no position for 30 min. Red with the repeating alarm until someone takes it in Incidents; it closes by itself when the car's position comes back.", mode: "fixed", level: "critical", path: "/incidents" },
  { id: "ride_check", group: "safety", label: "Ride check", help: "The driver or rider tapped Accident, Someone hurt or I feel unsafe. A later Yes or Not sure updates it. A red banner shows on every page until an admin opens it. Taken and solved in Incidents.", mode: "fixed", level: "critical", anyOf: ["incidents.read", "trips.intervene"], path: "/incidents" },
  { id: "sos_slow", group: "safety", label: "SOS taken but not solved", help: "Minutes since the SOS was taken. The SOS alert says it is not solved yet.", mode: "limits", direction: "up", unit: "min", limits: { info: null, important: 15, critical: 30 }, path: "/incidents" },
  { id: "long_wait", group: "dispatch", label: "A rider waits too long", help: "Important from the limit set per zone in Dispatch → Alerts. Critical from the number here.", mode: "limits", direction: "up", unit: "min", limits: { info: null, important: null, critical: 15 }, fromDispatch: true, path: "/dispatch?view=live" },
  { id: "few_drivers", group: "dispatch", label: "Few free drivers in a zone", help: "The limit is set per zone in Dispatch → Alerts.", mode: "fixed", level: "important", fromDispatch: true, path: "/dispatch?view=live" },
  { id: "no_driver", group: "dispatch", label: "Many requests without a driver", help: "The limit is set per zone in Dispatch → Alerts.", mode: "fixed", level: "critical", fromDispatch: true, path: "/dispatch?view=live" },
  { id: "late_reservation", group: "dispatch", label: "Booked ride soon with no driver", help: "Minutes left before pickup.", mode: "limits", direction: "down", unit: "min left", limits: { info: null, important: 60, critical: 20 }, path: "/reservations" },
  { id: "doc_expiring", group: "drivers", label: "Driver document expiring or expired", help: "Days left. 0 or less means expired.", mode: "limits", direction: "down", unit: "days", limits: { info: 30, important: 7, critical: 0 }, path: "/drivers" },
  { id: "low_rating", group: "drivers", label: "Driver rating is low", help: "Stars.", mode: "limits", direction: "down", unit: "stars", limits: { info: 4.5, important: 4.2, critical: null }, path: "/drivers" },
  { id: "auto_offline", group: "drivers", label: "Driver went offline after offers not accepted", help: "From Dispatch → Go offline automatically.", mode: "fixed", level: "info", path: "/drivers" },
  { id: "payment_failed", group: "money", label: "A ride payment failed", help: "A system error is shown as Critical, a rider's card as Important.", mode: "fixed", level: "important", path: "/payments" },
  { id: "refund_approval", group: "money", label: "A refund waits for approval", help: "", mode: "fixed", level: "important", path: "/confirm" },
  { id: "payout_big", group: "money", label: "Unusually large driver payout", help: "Payout amount.", mode: "limits", direction: "up", unit: "money", limits: { info: null, important: 8000, critical: 20000 }, path: "/payouts" },
  { id: "rider_fraud", group: "riders", label: "Possible rider fraud", help: "Same card on many accounts, chargebacks and more.", mode: "fixed", level: "important", path: "/riders" },
  { id: "rider_cancels", group: "riders", label: "Rider cancels a lot", help: "Cancel rate in %.", mode: "limits", direction: "up", unit: "%", limits: { info: 30, important: 50, critical: null }, path: "/riders" },
  { id: "ticket_open", group: "riders", label: "Support ticket waiting", help: "", mode: "fixed", level: "info", path: "/support" },
  { id: "system_health", group: "system", label: "App, map or payments down or slow", help: "Down is Critical, slow is Important.", mode: "fixed", level: "critical", path: "/system" },
];

export function kindDef(id: KindId): KindDef | undefined {
  return KINDS.find((item) => item.id === id);
}

export type KindSettings = {
  on: boolean;
  level: Level;
  limits: Limits;
  /** Who gets it. "all" is every admin. */
  who: "all" | Role[];
  escalate: { on: boolean; afterMin: number; to: Role };
};

export type Channel = { sound: boolean; browser: boolean; email: boolean; sms: boolean };

export type AlertSettings = {
  kinds: Record<string, KindSettings>;
  channels: Record<Level, Channel>;
  extras: { snooze: boolean; pass: boolean; mute: boolean; fixLink: boolean };
  /** Older parts of the panel that show alerts on their own. Off means they read from Alerts. */
  legacy: { dashboardCounts: boolean; dashboardSound: boolean; inbox: boolean; dispatchAlerts: boolean };
};

export type Metric = "free_drivers" | "riders_waiting" | "longest_wait" | "failed_payments" | "open_sos" | "open_tickets";

export const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: "free_drivers", label: "Free drivers", unit: "drivers" },
  { id: "riders_waiting", label: "Riders waiting for a driver", unit: "riders" },
  { id: "longest_wait", label: "Longest rider wait", unit: "min" },
  { id: "failed_payments", label: "Failed payments", unit: "payments" },
  { id: "open_sos", label: "Open SOS", unit: "SOS" },
  { id: "open_tickets", label: "Open support tickets", unit: "tickets" },
];

export type AlertRule = {
  id: string;
  name: string;
  on: boolean;
  metric: Metric;
  op: "above" | "below";
  value: number;
  forMin: number;
  zoneId: string;
  level: Level;
  who: "all" | Role[];
  country: string;
  by: string;
};

export type AlertEvent = { at: string; by: string; kind: "take" | "done" | "snooze" | "pass" | "reopen"; text: string; to?: string };

export type AlertRecord = {
  id: string;
  kind: KindId;
  level: Level;
  title: string;
  zoneId: string | null;
  since: string;
  status: "taken" | "done" | "snoozed";
  owner: string | null;
  snoozeUntil?: string;
  events: AlertEvent[];
};

export type AlertBook = {
  draftRev: number;
  settings: AlertSettings;
  rules: AlertRule[];
  records: Record<string, AlertRecord>;
  mutes: Record<string, { until: string; by: string }>;
  personal: Record<string, { quiet: { on: boolean; from: string; to: string } }>;
};

export function defaultKind(def: KindDef): KindSettings {
  return {
    on: true,
    level: def.level ?? "important",
    limits: { ...(def.limits ?? { info: null, important: null, critical: null }) },
    who: "all",
    escalate: { on: false, afterMin: 10, to: "ops" },
  };
}

export function defaultSettings(): AlertSettings {
  return {
    kinds: Object.fromEntries(KINDS.map((def) => [def.id, defaultKind(def)])),
    channels: {
      critical: { sound: true, browser: true, email: false, sms: false },
      important: { sound: false, browser: false, email: false, sms: false },
      info: { sound: false, browser: false, email: false, sms: false },
    },
    extras: { snooze: false, pass: false, mute: false, fixLink: false },
    legacy: { dashboardCounts: false, dashboardSound: false, inbox: false, dispatchAlerts: false },
  };
}

export function emptyAlertBook(): AlertBook {
  return { draftRev: 1, settings: defaultSettings(), rules: [], records: {}, mutes: {}, personal: {} };
}

export function normalizeAlertBook(value: unknown): AlertBook {
  const base = emptyAlertBook();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<AlertBook>;
  const settings = raw.settings ?? base.settings;
  return {
    draftRev: typeof raw.draftRev === "number" && raw.draftRev > 0 ? raw.draftRev : 1,
    settings: {
      kinds: Object.fromEntries(KINDS.map((def) => [def.id, { ...defaultKind(def), ...(settings.kinds?.[def.id] ?? {}) }])),
      channels: { ...base.settings.channels, ...(settings.channels ?? {}) },
      extras: { ...base.settings.extras, ...(settings.extras ?? {}) },
      legacy: { ...base.settings.legacy, ...(settings.legacy ?? {}) },
    },
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    records: raw.records && typeof raw.records === "object" ? raw.records : {},
    mutes: raw.mutes ?? {},
    personal: raw.personal ?? {},
  };
}

/** Everything the alerts are worked out from. Gathered by the hook from the panel's data. */
export type Facts = {
  now: number;
  day: string;
  zones: { id: string; name: string }[];
  incidents: { id: string; zoneId: string; who: string; status: string; owner: string | null; takenAt: string | null; createdAt: string | null; late?: string | null; kind?: string }[];
  /** Ride checks that sent an alert, with their incident's status and opening time. */
  rideChecks: { id: string; incidentId: string; zoneId: string; status: string; title: string; detail: string; since: number }[];
  requests: { tripId: string; rider: string; zoneId: string; waitingMin: number; searching: boolean }[];
  freeByZone: Record<string, number>;
  dispatch: (zoneId: string) => { long_wait: { on: boolean; limit: number }; few_drivers: { on: boolean; limit: number }; no_driver: { on: boolean; limit: number } };
  lateRides: { id: string; rider: string; zoneId: string; minutesLeft: number }[];
  documents: { driverId: string; driver: string; zoneId: string; doc: string; days: number }[];
  ratings: { driverId: string; driver: string; zoneId: string; rating: number }[];
  offline: { driverId: string; driver: string; zoneId: string; count: number }[];
  payments: { id: string; zoneId: string; rider: string; amount: number; system: boolean; reason: string; at?: string }[];
  refunds: { id: string; title: string }[];
  payouts: { id: string; driver: string; zoneId: string; amount: number }[];
  riders: { id: string; name: string; flags: string[]; cancelRate: number; rides: number }[];
  tickets: { id: string; name: string; zoneId: string }[];
  system: { id: string; name: string; state: "ok" | "slow" | "down"; detail: string }[];
  money: (major: number) => string;
};

export type Alert = {
  id: string;
  kind: KindId;
  group: GroupId;
  level: Level;
  title: string;
  detail: string;
  zoneId: string | null;
  since: number;
  path: string;
  /** For SOS and Ride check: the incident, so Take uses the same command as Incidents. */
  incidentId?: string;
  rideCheckId?: string;
  ruleId?: string;
};

/** SOS and Ride check alerts follow their incident: one owner, taken and solved in Incidents. */
export function followsIncident(kind: KindId): boolean {
  return kind === "sos" || kind === "sos_slow" || kind === "ride_check" || kind === "car_lost";
}

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

const FIRST_SEEN = new Map<string, number>();

/** When the panel first saw a live alert (kept for the session). */
export function firstSeen(id: string, now: number): number {
  const seen = FIRST_SEEN.get(id);
  if (seen !== undefined) return seen;
  FIRST_SEEN.set(id, now);
  return now;
}

/** The level a number reaches, or null when it is fine. */
export function levelFor(value: number, limits: Limits, direction: "up" | "down"): Level | null {
  const reached = (limit: number | null) => limit !== null && (direction === "up" ? value >= limit : value <= limit);
  if (reached(limits.critical)) return "critical";
  if (reached(limits.important)) return "important";
  if (reached(limits.info)) return "info";
  return null;
}

/** Work out every alert from the facts and the settings. */
export function computeAlerts(facts: Facts, settings: AlertSettings, rules: readonly AlertRule[]): Alert[] {
  const out: Alert[] = [];
  const zoneName = (id: string | null) => facts.zones.find((zone) => zone.id === id)?.name ?? id ?? "";
  const inZones = new Set(facts.zones.map((zone) => zone.id));
  const k = (id: KindId) => settings.kinds[id] ?? defaultKind(kindDef(id)!);
  const ago = (min: number) => facts.now - min * 60_000;
  // Live: an alert without its own time is dated when the panel first saw it, never a made-up "minutes ago".
  const seeded = (id: string, span = 50) => (isLiveData() ? firstSeen(id, facts.now) : ago(2 + (hash(id) % span)));
  const push = (alert: Omit<Alert, "group" | "path"> & { path?: string }) => {
    const def = kindDef(alert.kind);
    out.push({ ...alert, group: def?.group ?? "system", path: alert.path ?? def?.path ?? "/alerts" });
  };

  // An SOS stays in the list from the moment it comes in until it is solved, with who works on it.
  if (k("sos").on) {
    for (const row of facts.incidents.filter((item) => item.kind !== "ride_check" && item.kind !== "car_lost" && (item.status === "queued" || item.status === "taken") && inZones.has(item.zoneId))) {
      const minutes = row.takenAt ? Math.round((facts.now - Date.parse(row.takenAt)) / 60_000) : 0;
      const slow = row.status === "taken" && k("sos_slow").on && levelFor(minutes, k("sos_slow").limits, "up");
      push({ id: `sos:${row.id}`, kind: "sos", level: k("sos").level, title: slow ? tr("SOS from {0} not solved after {1} min", [row.who, minutes]) : row.late ? tr("SOS from {0} {1}", [row.who, row.late]) : tr("SOS from {0}", [row.who]), detail: `${zoneName(row.zoneId)} · ${row.id}`, zoneId: row.zoneId, since: row.createdAt ? Date.parse(row.createdAt) : row.takenAt ? Date.parse(row.takenAt) - 2 * 60_000 : seeded(row.id, 8), incidentId: row.id });
    }
  }

  // Car lost (safety part 1, 2026-10-27): red like an SOS, followed in Incidents, until the case is closed.
  if (k("car_lost").on) {
    for (const row of facts.incidents.filter((item) => item.kind === "car_lost" && (item.status === "queued" || item.status === "taken") && inZones.has(item.zoneId))) {
      push({ id: `car_lost:${row.id}`, kind: "car_lost", level: k("car_lost").level, title: tr("Car lost: {0}", [row.who]), detail: `${zoneName(row.zoneId)} · ${row.id}`, zoneId: row.zoneId, since: row.createdAt ? Date.parse(row.createdAt) : seeded(row.id, 8), incidentId: row.id, path: `/incidents?case=${row.id}` });
    }
  }

  // A ride check alert stays until its incident is solved; the banner goes once an admin opens it.
  if (k("ride_check").on) {
    for (const row of facts.rideChecks.filter((item) => (item.status === "queued" || item.status === "taken") && inZones.has(item.zoneId))) {
      push({ id: `ride_check:${row.id}`, kind: "ride_check", level: k("ride_check").level, title: row.title, detail: row.detail, zoneId: row.zoneId, since: row.since, incidentId: row.incidentId, rideCheckId: row.id, path: `/incidents?case=${row.incidentId}` });
    }
  }

  for (const zone of facts.zones) {
    const limits = facts.dispatch(zone.id);
    const waiting = facts.requests.filter((request) => request.zoneId === zone.id && request.searching);
    if (k("long_wait").on && limits.long_wait.on) {
      for (const request of waiting) {
        const level = levelFor(request.waitingMin, { info: null, important: limits.long_wait.limit, critical: k("long_wait").limits.critical }, "up");
        if (level) push({ id: `long_wait:${request.tripId}`, kind: "long_wait", level, title: tr("{0} has waited {1} min", [request.rider, request.waitingMin]), detail: `${zone.name} · ${request.tripId}`, zoneId: zone.id, since: ago(request.waitingMin) });
      }
    }
    const free = facts.freeByZone[zone.id] ?? 0;
    if (k("few_drivers").on && limits.few_drivers.on && free <= limits.few_drivers.limit) {
      push({ id: `few_drivers:${zone.id}:${facts.day}`, kind: "few_drivers", level: k("few_drivers").level, title: free === 1 ? tr("Only 1 free driver in {0}", [zone.name]) : tr("Only {0} free drivers in {1}", [free, zone.name]), detail: tr("Limit {0} (Dispatch)", [limits.few_drivers.limit]), zoneId: zone.id, since: seeded(`few:${zone.id}`, 30) });
    }
    if (k("no_driver").on && limits.no_driver.on && waiting.length >= limits.no_driver.limit) {
      push({ id: `no_driver:${zone.id}:${facts.day}`, kind: "no_driver", level: k("no_driver").level, title: tr("{0} requests without a driver in {1}", [waiting.length, zone.name]), detail: tr("Limit {0} (Dispatch)", [limits.no_driver.limit]), zoneId: zone.id, since: seeded(`nod:${zone.id}`, 20) });
    }
  }

  if (k("late_reservation").on) {
    for (const ride of facts.lateRides.filter((item) => inZones.has(item.zoneId))) {
      const level = levelFor(ride.minutesLeft, k("late_reservation").limits, "down");
      if (level) push({ id: `late_reservation:${ride.id}`, kind: "late_reservation", level, title: tr("{0}'s booked ride in {1} min has no driver", [ride.rider, ride.minutesLeft]), detail: `${zoneName(ride.zoneId)} · ${ride.id}`, zoneId: ride.zoneId, since: seeded(ride.id, 40), path: `/reservations/${ride.id}` });
    }
  }
  if (k("doc_expiring").on) {
    for (const doc of facts.documents.filter((item) => inZones.has(item.zoneId))) {
      const level = levelFor(doc.days, k("doc_expiring").limits, "down");
      if (level) push({ id: `doc_expiring:${doc.driverId}:${doc.doc}`, kind: "doc_expiring", level, title: doc.days <= 0 ? tr("{0}: {1} has expired", [doc.driver, trx(doc.doc)]) : doc.days === 1 ? tr("{0}: {1} expires in 1 day", [doc.driver, trx(doc.doc)]) : tr("{0}: {1} expires in {2} days", [doc.driver, trx(doc.doc), doc.days]), detail: zoneName(doc.zoneId), zoneId: doc.zoneId, since: seeded(`${doc.driverId}${doc.doc}`, 600), path: `/drivers/${doc.driverId}` });
    }
  }
  if (k("low_rating").on) {
    for (const row of facts.ratings.filter((item) => inZones.has(item.zoneId))) {
      const level = levelFor(row.rating, k("low_rating").limits, "down");
      if (level) push({ id: `low_rating:${row.driverId}`, kind: "low_rating", level, title: tr("{0} has a {1} rating", [row.driver, row.rating.toFixed(1)]), detail: zoneName(row.zoneId), zoneId: row.zoneId, since: seeded(`r${row.driverId}`, 600), path: `/drivers/${row.driverId}` });
    }
  }
  if (k("auto_offline").on) {
    for (const row of facts.offline.filter((item) => inZones.has(item.zoneId))) {
      push({ id: `auto_offline:${row.driverId}:${facts.day}`, kind: "auto_offline", level: k("auto_offline").level, title: tr("{0} went offline after {1} offers not accepted", [row.driver, row.count]), detail: zoneName(row.zoneId), zoneId: row.zoneId, since: seeded(`o${row.driverId}`, 120), path: `/drivers/${row.driverId}` });
    }
  }
  if (k("payment_failed").on) {
    for (const row of facts.payments.filter((item) => inZones.has(item.zoneId))) {
      push({ id: `payment_failed:${row.id}`, kind: "payment_failed", level: row.system ? "critical" : k("payment_failed").level, title: row.rider === "Card" ? tr("A card payment of {0} failed", [facts.money(row.amount)]) : tr("{0}'s payment of {1} failed", [row.rider, facts.money(row.amount)]), detail: `${trx(row.reason)} · ${row.id}`, zoneId: row.zoneId, since: row.at ? Date.parse(row.at) : seeded(row.id, 180), path: `/payments/${row.id}` });
    }
  }
  if (k("refund_approval").on) {
    for (const row of facts.refunds) push({ id: `refund_approval:${row.id}`, kind: "refund_approval", level: k("refund_approval").level, title: row.title || tr("A refund waits for approval"), detail: row.id, zoneId: null, since: seeded(row.id, 240) });
  }
  if (k("payout_big").on) {
    for (const row of facts.payouts.filter((item) => inZones.has(item.zoneId))) {
      const level = levelFor(row.amount, k("payout_big").limits, "up");
      if (level) push({ id: `payout_big:${row.id}`, kind: "payout_big", level, title: tr("{0}'s payout is {1}", [row.driver, facts.money(row.amount)]), detail: row.id, zoneId: row.zoneId, since: seeded(row.id, 600), path: `/payouts/${row.id}` });
    }
  }
  if (k("rider_fraud").on) {
    for (const row of facts.riders.filter((item) => item.flags.length)) push({ id: `rider_fraud:${row.id}`, kind: "rider_fraud", level: k("rider_fraud").level, title: `${row.name}: ${trx(row.flags[0])}`, detail: row.flags.length > 1 ? tr("+{0} more signs", [row.flags.length - 1]) : "", zoneId: null, since: seeded(`f${row.id}`, 900), path: `/riders/${row.id}` });
  }
  if (k("rider_cancels").on) {
    for (const row of facts.riders.filter((item) => item.rides >= 5)) {
      const level = levelFor(row.cancelRate, k("rider_cancels").limits, "up");
      if (level) push({ id: `rider_cancels:${row.id}`, kind: "rider_cancels", level, title: tr("{0} cancels {1}% of rides", [row.name, row.cancelRate]), detail: tr("{0} rides", [row.rides]), zoneId: null, since: seeded(`c${row.id}`, 900), path: `/riders/${row.id}` });
    }
  }
  if (k("ticket_open").on) {
    for (const row of facts.tickets.filter((item) => inZones.has(item.zoneId))) push({ id: `ticket_open:${row.id}`, kind: "ticket_open", level: k("ticket_open").level, title: tr("Support ticket from {0}", [row.name]), detail: `${zoneName(row.zoneId)} · ${row.id}`, zoneId: row.zoneId, since: seeded(row.id, 300), path: `/tickets/${row.id}` });
  }
  if (k("system_health").on) {
    for (const row of facts.system.filter((item) => item.state !== "ok")) push({ id: `system_health:${row.id}:${facts.day}`, kind: "system_health", level: row.state === "down" ? "critical" : "important", title: row.state === "down" ? tr("{0} is down", [row.name]) : tr("{0} is slow", [row.name]), detail: row.detail, zoneId: null, since: seeded(row.id, 25) });
  }

  for (const rule of rules.filter((item) => item.on)) {
    for (const zone of facts.zones.filter((item) => rule.zoneId === "all" || item.id === rule.zoneId)) {
      const value = metricValue(facts, rule.metric, zone.id);
      if (rule.op === "above" ? value > rule.value : value < rule.value) {
        const unit = METRICS.find((item) => item.id === rule.metric)?.unit ?? "";
        push({ id: `rule:${rule.id}:${zone.id}:${facts.day}`, kind: "rule", level: rule.level, title: tr("{0}: {1} {2} in {3}", [rule.name, value, trx(unit), zone.name]), detail: tr("Your rule: {0} {1} {2} for {3} min", [trx(METRICS.find((item) => item.id === rule.metric)?.label), trx(rule.op), rule.value, rule.forMin]), zoneId: zone.id, since: seeded(`${rule.id}${zone.id}`, 30), ruleId: rule.id, path: "/alerts?view=rules" });
      }
    }
  }
  return out;
}

export function metricValue(facts: Facts, metric: Metric, zoneId: string): number {
  const waiting = facts.requests.filter((request) => request.zoneId === zoneId && request.searching);
  if (metric === "free_drivers") return facts.freeByZone[zoneId] ?? 0;
  if (metric === "riders_waiting") return waiting.length;
  if (metric === "longest_wait") return waiting.reduce((max, request) => Math.max(max, request.waitingMin), 0);
  if (metric === "failed_payments") return facts.payments.filter((row) => row.zoneId === zoneId).length;
  if (metric === "open_sos") return facts.incidents.filter((row) => row.zoneId === zoneId && row.status === "queued" && row.kind !== "ride_check").length;
  return facts.tickets.filter((row) => row.zoneId === zoneId).length;
}

/** How many times a rule would have alerted over the last 24 hours, from a demo history around today's value. */
export function rulePreview(rule: Pick<AlertRule, "metric" | "op" | "value" | "forMin" | "zoneId">, facts: Facts): { times: number; zones: number } | null {
  // Live: there is no 24 h history on the server yet; never a demo wave.
  if (isLiveData()) return null;
  let times = 0;
  const hit = new Set<string>();
  for (const zone of facts.zones.filter((item) => rule.zoneId === "all" || item.id === rule.zoneId)) {
    const now = metricValue(facts, rule.metric, zone.id);
    const seed = hash(`${rule.metric}:${zone.id}`);
    const need = Math.max(1, Math.round(rule.forMin / 5));
    let run = 0;
    for (let step = 0; step < 288; step += 1) {
      const wave = Math.sin((step / 288) * Math.PI * 4 + (seed % 7)) * (1 + now * 0.5) + (((seed >>> (step % 20)) & 3) - 1.5) * 0.6;
      const value = Math.max(0, Math.round(now + wave));
      const holds = rule.op === "above" ? value > rule.value : value < rule.value;
      run = holds ? run + 1 : 0;
      if (run === need) {
        times += 1;
        hit.add(zone.id);
      }
    }
  }
  return { times, zones: hit.size };
}

export function ruleIssues(rule: AlertRule): string[] {
  const issues: string[] = [];
  if (!rule.name.trim()) issues.push("Give the rule a name.");
  if (!Number.isFinite(rule.value) || rule.value < 0 || rule.value > 1000) issues.push("The number must be 0 to 1000.");
  if (rule.forMin < 0 || rule.forMin > 240) issues.push("The time must be 0 to 240 minutes.");
  if (rule.op === "below" && rule.value === 0) issues.push("Nothing can be below 0. Use above, or a higher number.");
  return issues;
}

export function settingsIssues(settings: AlertSettings): string[] {
  const issues: string[] = [];
  for (const def of KINDS.filter((item) => item.mode === "limits")) {
    const stored = settings.kinds[def.id]?.limits;
    if (!stored) continue;
    // For Dispatch kinds the Important limit is set per zone in Dispatch, not here.
    const limits = def.fromDispatch ? { ...stored, important: null } : stored;
    const set = [limits.info, limits.important, limits.critical].filter((value): value is number => value !== null);
    if (set.some((value) => !Number.isFinite(value) || value < -365)) issues.push(`${def.label}: limits must be numbers.`);
    const ordered = def.direction === "up"
      ? (limits.info === null || limits.important === null || limits.info <= limits.important) && (limits.important === null || limits.critical === null || limits.important <= limits.critical)
      : (limits.info === null || limits.important === null || limits.info >= limits.important) && (limits.important === null || limits.critical === null || limits.important >= limits.critical);
    if (!ordered) issues.push(`${def.label}: ${def.direction === "up" ? "Critical must be the highest number" : "Critical must be the lowest number"}.`);
  }
  for (const def of KINDS) {
    const item = settings.kinds[def.id];
    if (item && Array.isArray(item.who) && item.who.length === 0) issues.push(`${def.label}: pick who gets it, or choose every admin.`);
    if (item?.escalate.on && (item.escalate.afterMin < 1 || item.escalate.afterMin > 240)) issues.push(`${def.label}: pass on after 1 to 240 minutes.`);
  }
  return issues;
}

/** A viewer can always open the data behind what they see; can(role, permission) decides. */
export type Viewer = { id: string; role: Role; can?: (permission: string) => boolean };

/** Who sees an alert: everyone by default, or the roles set for its kind; after the wait, the next person too. */
export function visibleTo(alert: Alert, book: AlertBook, viewer: Viewer, now: number): boolean {
  // Never show an alert about data the role cannot open, whatever the routing says.
  const anyOf = kindDef(alert.kind)?.anyOf;
  const need = GROUPS.find((group) => group.id === alert.group)?.permission;
  if (anyOf && viewer.can && !anyOf.some((permission) => viewer.can!(permission))) return false;
  if (!anyOf && need && viewer.can && !viewer.can(need)) return false;
  if (viewer.role === "super") return true;
  const record = book.records[alert.id];
  if (record?.owner === viewer.id) return true;
  const who = alert.kind === "rule" ? book.rules.find((rule) => rule.id === alert.ruleId)?.who ?? "all" : book.settings.kinds[alert.kind]?.who ?? "all";
  if (who === "all" || who.includes(viewer.role)) return true;
  const escalate = alert.kind === "rule" ? null : book.settings.kinds[alert.kind]?.escalate;
  return Boolean(escalate?.on && !record?.owner && now - alert.since >= escalate.afterMin * 60_000 && escalate.to === viewer.role);
}

export type OpenAlert = Alert & { status: "new" | "taken" | "snoozed"; owner: string | null; record: AlertRecord | null; muted: boolean };

/** Join the alerts with who works on them. Done ones leave the open list; SOS follows Incidents. */
export function openAlerts(alerts: readonly Alert[], book: AlertBook, now: number, sosOwner: (incidentId: string) => string | null): OpenAlert[] {
  const level = { critical: 0, important: 1, info: 2 } as const;
  // Same level: safety first, then what hurts riders right now.
  const group: Record<GroupId, number> = { safety: 0, dispatch: 1, system: 2, money: 3, drivers: 4, riders: 5 };
  return alerts
    .map((alert): OpenAlert | null => {
      const record = book.records[alert.id] ?? null;
      const muted = Boolean(book.mutes[alert.kind] && Date.parse(book.mutes[alert.kind].until) > now);
      if ((alert.kind === "sos" || alert.kind === "ride_check" || alert.kind === "car_lost") && alert.incidentId) {
        const owner = sosOwner(alert.incidentId);
        return { ...alert, status: owner ? "taken" : "new", owner, record, muted: false };
      }
      if (record?.status === "done") return null;
      if (record?.status === "snoozed" && record.snoozeUntil && Date.parse(record.snoozeUntil) > now) return { ...alert, status: "snoozed", owner: record.owner, record, muted };
      return { ...alert, status: record?.owner ? "taken" : "new", owner: record?.owner ?? null, record, muted };
    })
    .filter((item): item is OpenAlert => Boolean(item))
    .sort((a, b) => level[a.level] - level[b.level] || group[a.group] - group[b.group] || a.since - b.since);
}

function base(alert: Alert, record: AlertRecord | undefined): AlertRecord {
  return record ?? { id: alert.id, kind: alert.kind, level: alert.level, title: alert.title, zoneId: alert.zoneId, since: new Date(alert.since).toISOString(), status: "taken", owner: null, events: [] };
}

function save(book: AlertBook, record: AlertRecord): AlertBook {
  return { ...book, draftRev: book.draftRev + 1, records: { ...book.records, [record.id]: record } };
}

/** "Nora is working on it". Nobody else can take it while it is taken. */
export function takeAlert(book: AlertBook, alert: Alert, actor: string, at: string): { book: AlertBook; error?: string } {
  if (alert.kind === "sos" || alert.kind === "car_lost") return { book, error: "Take an SOS with the Incidents take, so there is one owner." };
  if (alert.kind === "ride_check") return { book, error: "Take a ride check with the Incidents take, so there is one owner." };
  const record = base(alert, book.records[alert.id]);
  if (record.owner && record.owner !== actor && record.status !== "done") return { book, error: `${record.owner} is already working on it.` };
  return { book: save(book, { ...record, level: alert.level, title: alert.title, status: "taken", owner: actor, snoozeUntil: undefined, events: [...record.events, { at, by: actor, kind: "take", text: "Working on it" }] }) };
}

/** "Solved by Nora". Only the person working on it can close it; an alert nobody took can be closed directly. */
export function doneAlert(book: AlertBook, alert: Alert, actor: string, note: string, at: string): { book: AlertBook; error?: string } {
  if (alert.kind === "sos" || alert.kind === "car_lost") return { book, error: "Solve an SOS in Incidents, so there is one owner." };
  if (alert.kind === "ride_check") return { book, error: "Solve a ride check in Incidents, so there is one owner." };
  const record = base(alert, book.records[alert.id]);
  if (record.owner && record.owner !== actor) return { book, error: `Only ${record.owner} can mark it solved, or they pass it to you.` };
  const events = record.owner ? record.events : [...record.events, { at, by: actor, kind: "take" as const, text: "Working on it" }];
  return { book: save(book, { ...record, level: alert.level, title: alert.title, status: "done", owner: actor, events: [...events, { at, by: actor, kind: "done", text: note.trim() || "Solved" }] }) };
}

export function snoozeAlert(book: AlertBook, alert: Alert, actor: string, minutes: number, at: string): { book: AlertBook; error?: string } {
  if (alert.kind === "sos" || alert.kind === "ride_check" || alert.kind === "car_lost") return { book, error: "An SOS or a ride check cannot be snoozed." };
  const record = base(alert, book.records[alert.id]);
  if (record.owner && record.owner !== actor) return { book, error: `${record.owner} is working on it.` };
  const until = new Date(Date.parse(at) + minutes * 60_000).toISOString();
  return { book: save(book, { ...record, status: "snoozed", owner: record.owner, snoozeUntil: until, events: [...record.events, { at, by: actor, kind: "snooze", text: `Remind in ${minutes} min` }] }) };
}

export function passAlert(book: AlertBook, alert: Alert, actor: string, to: string, at: string): { book: AlertBook; error?: string } {
  if (alert.kind === "sos" || alert.kind === "ride_check" || alert.kind === "car_lost") return { book, error: "Pass an SOS or a ride check in Incidents." };
  if (to === actor) return { book, error: "Pick another admin." };
  const record = base(alert, book.records[alert.id]);
  if (record.owner && record.owner !== actor) return { book, error: `${record.owner} is working on it.` };
  return { book: save(book, { ...record, status: "taken", owner: to, events: [...record.events, { at, by: actor, kind: "pass", text: `Passed to ${to}`, to }] }) };
}

export function muteKind(book: AlertBook, kind: KindId, actor: string, minutes: number, at: string): AlertBook {
  return { ...book, draftRev: book.draftRev + 1, mutes: { ...book.mutes, [kind]: { until: new Date(Date.parse(at) + minutes * 60_000).toISOString(), by: actor } } };
}

export function unmuteKind(book: AlertBook, kind: KindId): AlertBook {
  const mutes = { ...book.mutes };
  delete mutes[kind];
  return { ...book, draftRev: book.draftRev + 1, mutes };
}

export type HistoryRow = AlertRecord & { takenBy: string; solvedBy: string; takeMin: number; solveMin: number; note: string; doneAt: string };

export function historyRows(book: AlertBook): HistoryRow[] {
  return Object.values(book.records)
    .filter((record) => record.status === "done")
    .map((record) => {
      const take = record.events.find((event) => event.kind === "take");
      const done = [...record.events].reverse().find((event) => event.kind === "done")!;
      const since = Date.parse(record.since);
      return {
        ...record,
        takenBy: take?.by ?? done.by,
        solvedBy: done.by,
        takeMin: Math.max(0, Math.round(((take ? Date.parse(take.at) : Date.parse(done.at)) - since) / 60_000)),
        solveMin: Math.max(0, Math.round((Date.parse(done.at) - since) / 60_000)),
        note: done.text,
        doneAt: done.at,
      };
    })
    .sort((a, b) => b.doneAt.localeCompare(a.doneAt));
}

/** The same problem again: same kind and same person or zone, solved more than once. */
export function entityKey(id: string): string {
  const parts = id.split(":");
  return /^\d{4}-\d{2}-\d{2}$/.test(parts[parts.length - 1] ?? "") ? parts.slice(0, -1).join(":") : id;
}

export type Numbers = { count: number; avgTake: number; avgSolve: number; byKind: { kind: KindId; count: number; avgSolve: number }[]; byAdmin: { admin: string; count: number; avgSolve: number }[]; byZone: { zoneId: string; count: number }[]; repeats: { key: string; title: string; count: number }[] };

export function numbers(rows: readonly HistoryRow[]): Numbers {
  const avg = (list: number[]) => (list.length ? Math.round(list.reduce((sum, value) => sum + value, 0) / list.length) : 0);
  const group = <T,>(key: (row: HistoryRow) => T) => {
    const map = new Map<T, HistoryRow[]>();
    for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
    return map;
  };
  const repeats = [...group((row) => entityKey(row.id)).entries()].filter(([, list]) => list.length > 1).map(([key, list]) => ({ key, title: list[0].title, count: list.length })).sort((a, b) => b.count - a.count);
  return {
    count: rows.length,
    avgTake: avg(rows.map((row) => row.takeMin)),
    avgSolve: avg(rows.map((row) => row.solveMin)),
    byKind: [...group((row) => row.kind).entries()].map(([kind, list]) => ({ kind, count: list.length, avgSolve: avg(list.map((row) => row.solveMin)) })).sort((a, b) => b.count - a.count),
    byAdmin: [...group((row) => row.solvedBy).entries()].map(([admin, list]) => ({ admin, count: list.length, avgSolve: avg(list.map((row) => row.solveMin)) })).sort((a, b) => b.count - a.count),
    byZone: [...group((row) => row.zoneId ?? "none").entries()].map(([zoneId, list]) => ({ zoneId, count: list.length })).sort((a, b) => b.count - a.count),
    repeats,
  };
}

function cell(value: string | number): string {
  // Numbers stay as they are; text (titles, notes, admin names) goes through the formula guard.
  return typeof value === "number" ? String(value) : csvCell(value);
}

export function historyCsv(rows: readonly HistoryRow[]): string {
  const head = ["Alert", "Kind", "Level", "Zone", "Started", "Taken by", "Solved by", "Solved at", "Minutes to take", "Minutes to solve", "Note"];
  return [head, ...rows.map((row) => [row.title, kindDef(row.kind)?.label ?? "Your rule", row.level, row.zoneId ?? "", row.since, row.takenBy, row.solvedBy, row.doneAt, row.takeMin, row.solveMin, row.note])].map((line) => line.map(cell).join(",")).join("\n");
}

/** A short weekly text for managers: what came in, how fast it was handled, what keeps coming back. */
export function weeklySummary(rows: readonly HistoryRow[], now: number, label: (kind: KindId) => string): string[] {
  const week = rows.filter((row) => Date.parse(row.doneAt) >= now - 7 * 86_400_000);
  const stats = numbers(week);
  if (!week.length) return ["No alert was solved in the last 7 days."];
  const lines = [
    `${stats.count} alert${stats.count === 1 ? "" : "s"} solved in the last 7 days: ${week.filter((row) => row.level === "critical").length} critical, ${week.filter((row) => row.level === "important").length} important, ${week.filter((row) => row.level === "info").length} info.`,
    `Taken after ${stats.avgTake} min and solved after ${stats.avgSolve} min on average.`,
  ];
  const slow = [...stats.byKind].sort((a, b) => b.avgSolve - a.avgSolve)[0];
  if (slow) lines.push(`Slowest to solve: ${label(slow.kind)} (${slow.avgSolve} min on average).`);
  if (stats.byAdmin[0]) lines.push(`Most solved: ${stats.byAdmin.slice(0, 3).map((row) => `${row.admin} (${row.count})`).join(", ")}.`);
  if (stats.repeats[0]) lines.push(`Keeps coming back: ${stats.repeats.slice(0, 2).map((row) => `${row.title} (${row.count} times)`).join("; ")}.`);
  return lines;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Quiet hours for one admin: no sound and no browser notification, even for Critical. */
export function inQuiet(quiet: { on: boolean; from: string; to: string } | undefined, hhmm: string): boolean {
  if (!quiet?.on) return false;
  const now = minutesOf(hhmm);
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  return from < to ? now >= from && now < to : now >= from || now < to;
}
