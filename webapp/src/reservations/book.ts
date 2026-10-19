import type { DemoRecord } from "../api/seed.ts";

export type ReservationStatus = "waiting" | "booked" | "assigned" | "cancelled" | "completed" | "no_show";

/** Statuses a scheduled ride can no longer leave. */
export function reservationClosed(status: string): boolean {
  return status === "cancelled" || status === "completed" || status === "no_show";
}

export type ReservationPolicy = {
  version: string;
  bookingHorizonDays: number;
  assignmentLeadMinutes: number;
  giveUpMinutes: number;
  includedWaitingMinutes: number;
};

export type Reservation = {
  id: string;
  pickupAt: string;
  driverId: string | null;
  policyVersion: string;
  status: ReservationStatus;
};

export type ReservationContact = {
  id: string;
  at: string;
  actorId: string;
  channel: "call" | "sms";
  note: string;
};

export type ReservationOffer = {
  id: string;
  at: string;
  actorId: string;
  driverId: string;
  result: "offered" | "accepted" | "declined" | "expired";
};

/**
 * An admin gave the ride to one driver. It reaches the driver like an Exclusive ("Assigned by Movera")
 * with a timer, and the driver must accept. Not accepted in time or declined: the admin picks someone else.
 */
export type ReservationAsk = {
  id: string;
  driverId: string;
  at: string;
  by: string;
  expiresAt: string;
  answer: "waiting" | "accepted" | "declined";
  answeredAt: string | null;
};

/** A raise of the driver's fare for a ride nobody takes, paid from Movera's commission. In the zone's money. */
export type ReservationRaise = { amount: number; by: string; at: string };

export type ReservationOps = {
  reservationId: string;
  pickupAt: string;
  returnPickupAt: string | null;
  category: DemoRecord["category"];
  policy: ReservationPolicy;
  contacts: ReservationContact[];
  offers: ReservationOffer[];
  activity: string[];
  /** Newest first. Saves from before this have none. */
  asks: ReservationAsk[];
  raise: ReservationRaise | null;
};

export type ReservationBook = {
  draftRev: number;
  currentPolicy: ReservationPolicy;
  policies: Record<string, ReservationPolicy>;
  reservations: Record<string, ReservationOps>;
};

export const GIVE_UP_MINUTES = 5;

export const DEFAULT_RESERVATION_POLICY: ReservationPolicy = {
  version: "res-2",
  bookingHorizonDays: 7,
  assignmentLeadMinutes: 30,
  giveUpMinutes: GIVE_UP_MINUTES,
  includedWaitingMinutes: 5,
};

export const LEGACY_RESERVATION_POLICY: ReservationPolicy = {
  version: "res-1",
  bookingHorizonDays: 5,
  assignmentLeadMinutes: 45,
  giveUpMinutes: 5,
  includedWaitingMinutes: 5,
};

export function emptyReservationBook(): ReservationBook {
  return {
    draftRev: 1,
    currentPolicy: { ...DEFAULT_RESERVATION_POLICY },
    policies: {
      [LEGACY_RESERVATION_POLICY.version]: { ...LEGACY_RESERVATION_POLICY },
      [DEFAULT_RESERVATION_POLICY.version]: { ...DEFAULT_RESERVATION_POLICY },
    },
    reservations: {},
  };
}

/**
 * Fields older policies may still carry. "Free cancel after accept" is gone: the rider's free cancel time and fee are set
 * per zone and car type in Dispatch › Rides & stops › Rider cancel fees (reservations count it before pickup).
 */
const RETIRED_POLICY_FIELDS = ["freeCancelAfterAcceptMinutes"];

function withoutRetiredFields<T extends object>(policy: T): T {
  const copy = { ...policy } as Record<string, unknown>;
  for (const field of RETIRED_POLICY_FIELDS) delete copy[field];
  return copy as T;
}

export function normalizeReservationBook(value: unknown): ReservationBook {
  if (!value || typeof value !== "object") return emptyReservationBook();
  const raw = value as Partial<ReservationBook>;
  const currentPolicy = withoutRetiredFields(raw.currentPolicy ? { ...DEFAULT_RESERVATION_POLICY, ...raw.currentPolicy } : { ...DEFAULT_RESERVATION_POLICY });
  const reservations = raw.reservations && typeof raw.reservations === "object" ? structuredClone(raw.reservations) : {};
  for (const ops of Object.values(reservations)) if (ops && typeof ops === "object" && ops.policy && typeof ops.policy === "object") ops.policy = withoutRetiredFields(ops.policy);
  return {
    draftRev: typeof raw.draftRev === "number" && raw.draftRev > 0 ? raw.draftRev : 1,
    currentPolicy,
    policies: raw.policies && typeof raw.policies === "object"
      ? Object.fromEntries(Object.entries(structuredClone(raw.policies)).map(([version, policy]) => [version, policy && typeof policy === "object" ? withoutRetiredFields(policy) : policy]))
      : {
          [LEGACY_RESERVATION_POLICY.version]: { ...LEGACY_RESERVATION_POLICY },
          [DEFAULT_RESERVATION_POLICY.version]: { ...DEFAULT_RESERVATION_POLICY },
          [currentPolicy.version]: { ...currentPolicy },
        },
    reservations,
  };
}

function reservationIndex(id: string): number {
  const parsed = Number(id.replace(/\D/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : 0;
}

function fallbackPickupAt(record: Pick<DemoRecord, "id">): string {
  const index = reservationIndex(record.id);
  return new Date(Date.parse("2026-10-06T06:30:00.000Z") + index * 45 * 60_000).toISOString();
}

function fallbackCategory(record: Pick<DemoRecord, "id" | "category">): DemoRecord["category"] {
  if (record.category) return record.category;
  const categories: NonNullable<DemoRecord["category"]>[] = ["economy", "comfort", "premium", "priority", "xl", "electric", "pet"];
  return categories[reservationIndex(record.id) % categories.length];
}

export function reservationOps(book: ReservationBook, record: DemoRecord): ReservationOps {
  const stored = book.reservations[record.id] as (Omit<ReservationOps, "asks" | "raise"> & Partial<Pick<ReservationOps, "asks" | "raise">>) | undefined;
  if (stored) return { ...stored, asks: Array.isArray(stored.asks) ? stored.asks : [], raise: stored.raise ?? null };
  const pickupAt = record.pickupAt ?? fallbackPickupAt(record);
  const returnPickupAt = record.returnAt ?? (reservationIndex(record.id) % 8 === 0
    ? new Date(Date.parse(pickupAt) + 8 * 60 * 60_000).toISOString()
    : null);
  return {
    reservationId: record.id,
    pickupAt,
    returnPickupAt,
    category: fallbackCategory(record),
    policy: {
      ...(book.policies[record.policyVersion ?? book.currentPolicy.version] ?? book.currentPolicy),
      version: record.policyVersion ?? book.currentPolicy.version,
    },
    contacts: [],
    offers: [],
    activity: [`Reservation ${record.id} opened with policy ${record.policyVersion ?? book.currentPolicy.version}`],
    asks: [],
    raise: null,
  };
}

function withOps(book: ReservationBook, record: DemoRecord, next: ReservationOps): ReservationBook {
  return {
    ...book,
    draftRev: book.draftRev + 1,
    reservations: { ...book.reservations, [record.id]: next },
  };
}

export function minutesUntil(pickupAt: string, nowIso: string): number {
  return (Date.parse(pickupAt) - Date.parse(nowIso)) / 60000;
}

export function needsDriverSoon(reservation: Reservation, nowIso: string): boolean {
  return (reservation.status === "booked" || reservation.status === "waiting") && !reservation.driverId && minutesUntil(reservation.pickupAt, nowIso) < 60;
}

export function reservationWarning(record: DemoRecord, ops: ReservationOps, nowIso: string): string | null {
  if (reservationClosed(record.status)) return null;
  const minutes = minutesUntil(ops.pickupAt, nowIso);
  if (minutes < 0) return "Pickup time has passed.";
  if (!record.driverId && minutes <= ops.policy.giveUpMinutes) return `Give-up threshold reached: ${ops.policy.giveUpMinutes} minutes.`;
  if (!record.driverId && minutes <= ops.policy.assignmentLeadMinutes) return `Inside assignment lead: ${ops.policy.assignmentLeadMinutes} minutes.`;
  if (!record.driverId && minutes < 60) return "Needs a driver within 60 minutes.";
  return null;
}

export function assignReservation(reservation: Reservation, driverId: string): Reservation {
  return { ...reservation, driverId, status: "assigned" };
}

export function cancelReservation(reservation: Reservation): Reservation {
  return { ...reservation, status: "cancelled", driverId: reservation.driverId };
}

export function unassignReservation(record: DemoRecord): Partial<DemoRecord> {
  if (reservationClosed(record.status)) return {};
  return { driverId: null, status: "waiting" };
}

export function reservationCandidates(
  record: DemoRecord,
  ops: ReservationOps,
  drivers: readonly DemoRecord[],
  vehicles: readonly DemoRecord[],
): DemoRecord[] {
  return drivers.filter((driver) => {
    if (driver.status !== "active") return false;
    if (driver.id === record.driverId) return false;
    const vehicle = vehicles.find((item) => item.driverId === driver.id);
    if (!vehicle || vehicle.status !== "eligible") return false;
    return vehicle.category === ops.category;
  });
}

export function touchReservation(
  book: ReservationBook,
  record: DemoRecord,
  actorId: string,
  message: string,
): ReservationBook {
  const current = reservationOps(book, record);
  return withOps(book, record, {
    ...current,
    activity: [`${message} · ${actorId}`, ...current.activity].slice(0, 40),
  });
}

export function recordReservationContact(
  book: ReservationBook,
  record: DemoRecord,
  actorId: string,
  channel: ReservationContact["channel"],
  note: string,
  nowIso: string,
): { book: ReservationBook; error?: string } {
  if (!note.trim()) return { book, error: "A contact note is required." };
  const current = reservationOps(book, record);
  const contact: ReservationContact = {
    id: `${record.id}-contact-${current.contacts.length + 1}`,
    at: nowIso,
    actorId,
    channel,
    note: note.trim(),
  };
  return {
    book: withOps(book, record, {
      ...current,
      contacts: [contact, ...current.contacts],
      activity: [`${channel.toUpperCase()} contact logged by ${actorId}: ${note.trim()}`, ...current.activity].slice(0, 40),
    }),
  };
}

export function recordReservationOffer(
  book: ReservationBook,
  record: DemoRecord,
  driverId: string,
  actorId: string,
  result: ReservationOffer["result"],
  nowIso: string,
): ReservationBook {
  const current = reservationOps(book, record);
  const offer: ReservationOffer = {
    id: `${record.id}-offer-${current.offers.length + 1}`,
    at: nowIso,
    actorId,
    driverId,
    result,
  };
  return withOps(book, record, {
    ...current,
    offers: [offer, ...current.offers],
    activity: [`Offer ${result} for ${driverId} by ${actorId}`, ...current.activity].slice(0, 40),
  });
}

export type AskState = { ask: ReservationAsk; state: "waiting" | "accepted" | "declined" | "expired"; secondsLeft: number };

/** The newest "Assigned by Movera" request and where it stands now. Null when none was sent. */
export function currentAsk(ops: ReservationOps, nowIso: string): AskState | null {
  const ask = ops.asks[0];
  if (!ask) return null;
  const left = Math.max(0, Math.ceil((Date.parse(ask.expiresAt) - Date.parse(nowIso)) / 1000));
  if (ask.answer !== "waiting") return { ask, state: ask.answer, secondsLeft: 0 };
  return { ask, state: left > 0 ? "waiting" : "expired", secondsLeft: left };
}

/** Drivers who were asked for this ride and did not accept: declined or let the timer run out. */
export function notAccepted(ops: ReservationOps, nowIso: string): Set<string> {
  const out = new Set<string>();
  for (const ask of ops.asks) {
    const expired = ask.answer === "waiting" && Date.parse(ask.expiresAt) <= Date.parse(nowIso);
    if (ask.answer === "declined" || expired) out.add(ask.driverId);
  }
  return out;
}

/** Send the ride to one driver as "Assigned by Movera". The driver has acceptSec seconds to accept. */
export function askDriver(
  book: ReservationBook,
  record: DemoRecord,
  driverId: string,
  actorId: string,
  acceptSec: number,
  nowIso: string,
): { book: ReservationBook; error?: string } {
  const current = reservationOps(book, record);
  if (!driverId) return { book, error: "Pick a driver first." };
  if (reservationClosed(record.status) || record.status === "assigned") return { book, error: "This ride already has a driver or is closed." };
  const open = currentAsk(current, nowIso);
  if (open?.state === "waiting") return { book, error: `Waiting for ${open.ask.driverId} to accept.` };
  const ask: ReservationAsk = {
    id: `${record.id}-ask-${current.asks.length + 1}`,
    driverId,
    at: nowIso,
    by: actorId,
    expiresAt: new Date(Date.parse(nowIso) + Math.max(1, acceptSec) * 1000).toISOString(),
    answer: "waiting",
    answeredAt: null,
  };
  const offer: ReservationOffer = { id: `${record.id}-offer-${current.offers.length + 1}`, at: nowIso, actorId, driverId, result: "offered" };
  return {
    book: withOps(book, record, {
      ...current,
      asks: [ask, ...current.asks],
      offers: [offer, ...current.offers],
      activity: [`Assigned by Movera to ${driverId} by ${actorId}: ${acceptSec} s to accept`, ...current.activity].slice(0, 40),
    }),
  };
}

/** The driver's answer to "Assigned by Movera". Accepted: the ride is theirs. Declined: the admin picks someone else. */
export function answerAsk(
  book: ReservationBook,
  record: DemoRecord,
  answer: "accepted" | "declined",
  nowIso: string,
): { book: ReservationBook; patch: Partial<DemoRecord>; error?: string } {
  const current = reservationOps(book, record);
  const open = currentAsk(current, nowIso);
  if (!open || open.state !== "waiting") return { book, patch: {}, error: open?.state === "expired" ? "Time to accept has run out. Pick a driver again." : "No driver is being asked right now." };
  const asks = current.asks.map((item, index) => (index === 0 ? { ...item, answer, answeredAt: nowIso } : item));
  const result: ReservationOffer["result"] = answer === "accepted" ? "accepted" : "declined";
  const offer: ReservationOffer = { id: `${record.id}-offer-${current.offers.length + 1}`, at: nowIso, actorId: open.ask.driverId, driverId: open.ask.driverId, result };
  return {
    book: withOps(book, record, {
      ...current,
      asks,
      offers: [offer, ...current.offers],
      activity: [answer === "accepted" ? `${open.ask.driverId} accepted the ride assigned by Movera` : `${open.ask.driverId} did not accept the ride assigned by Movera`, ...current.activity].slice(0, 40),
    }),
    patch: answer === "accepted" ? { driverId: open.ask.driverId, status: "assigned" } : {},
  };
}

/** Raise the driver's fare so someone takes the ride. Paid from Movera's commission, never above the zone's highest raise. */
export function raiseFare(
  book: ReservationBook,
  record: DemoRecord,
  amount: number,
  max: number,
  actorId: string,
  nowIso: string,
  unit = "",
): { book: ReservationBook; error?: string } {
  const current = reservationOps(book, record);
  if (reservationClosed(record.status) || record.driverId) return { book, error: "Only a ride without a driver can get a higher fare." };
  if (!Number.isFinite(amount) || amount <= 0) return { book, error: "Write a raise above 0." };
  if (amount > max) return { book, error: `The raise can be at most ${max}${unit ? ` ${unit}` : ""}.` };
  return {
    book: withOps(book, record, {
      ...current,
      raise: { amount, by: actorId, at: nowIso },
      activity: [`Driver fare raised by ${amount}${unit ? ` ${unit}` : ""} by ${actorId}`, ...current.activity].slice(0, 40),
    }),
  };
}

export function scheduleReturnRide(
  book: ReservationBook,
  record: DemoRecord,
  returnPickupAt: string | null,
  actorId: string,
): { book: ReservationBook; error?: string } {
  const current = reservationOps(book, record);
  if (returnPickupAt) {
    const when = Date.parse(returnPickupAt);
    if (!Number.isFinite(when)) return { book, error: "Return pickup time is invalid." };
    if (when <= Date.parse(current.pickupAt)) return { book, error: "Return pickup must be after the outbound pickup." };
  }
  return {
    book: withOps(book, record, {
      ...current,
      returnPickupAt,
      activity: [returnPickupAt ? `Return ride scheduled by ${actorId}` : `Return ride removed by ${actorId}`, ...current.activity].slice(0, 40),
    }),
  };
}

export function saveReservationPolicy(
  book: ReservationBook,
  next: ReservationPolicy,
): { book: ReservationBook; error?: string } {
  const integers: [string, number, number, number][] = [
    ["Booking horizon", next.bookingHorizonDays, 1, 30],
    ["Assignment lead", next.assignmentLeadMinutes, 5, 240],
    ["Give-up time", next.giveUpMinutes, 1, 60],
    ["Included waiting", next.includedWaitingMinutes, 0, 60],
  ];
  for (const [label, value, min, max] of integers) {
    if (!Number.isInteger(value) || value < min || value > max) {
      return { book, error: `${label} must be a whole number from ${min} to ${max}.` };
    }
  }
  if (next.giveUpMinutes > next.assignmentLeadMinutes) {
    return { book, error: "Give-up time cannot exceed assignment lead time." };
  }
  const versionNumber = Number(book.currentPolicy.version.replace(/\D/g, "")) || 1;
  const currentPolicy = { ...next, version: `res-${versionNumber + 1}` };
  return {
    book: {
      ...book,
      draftRev: book.draftRev + 1,
      currentPolicy,
      policies: { ...book.policies, [currentPolicy.version]: { ...currentPolicy } },
      reservations: { ...book.reservations },
    },
  };
}

const STOCKHOLM_TZ = "Europe/Stockholm";
const FORMATS = new Map<string, Intl.DateTimeFormat>();

function zoneFormat(timeZone: string): Intl.DateTimeFormat {
  let format = FORMATS.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    FORMATS.set(timeZone, format);
  }
  return format;
}

/** "Stockholm" for Europe/Stockholm, "Tunis" for Africa/Tunis: the city part of the zone name. */
export function timeZoneCity(timeZone: string): string {
  return (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
}

/** The wall-clock time of an instant in a zone, as a datetime-local value (YYYY-MM-DDTHH:mm). */
export function zonedLocalValue(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(zoneFormat(timeZone).formatToParts(new Date(iso)).map((item) => [item.type, item.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function zonedLabel(iso: string, timeZone: string): string {
  return zoneFormat(timeZone).format(new Date(iso)).replace(" ", " · ");
}

/** Minutes the zone is ahead of UTC at an instant. */
function offsetMinutes(ms: number, timeZone: string): number {
  const local = zonedLocalValue(new Date(ms).toISOString(), timeZone);
  const [date, time] = local.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return Math.round((Date.UTC(year, month - 1, day, hour, minute) - Math.floor(ms / 60_000) * 60_000) / 60_000);
}

/**
 * The instant a wall-clock time in a zone stands for. A time skipped by a DST change is an error; a time
 * that happens twice (clocks going back) is `ambiguous`, and `disambiguation` picks the occurrence.
 */
export function zonedLocalToIso(
  local: string,
  timeZone: string,
  disambiguation: "earlier" | "later" = "earlier",
): { iso?: string; error?: string; ambiguous?: boolean } {
  const city = timeZoneCity(timeZone);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return { error: `Use a valid local ${city} date and time.` };
  const [, year, month, day, hour, minute] = match;
  const naive = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  // The zone's offsets a day either side cover both sides of any DST change on that day.
  const offsets = new Set([offsetMinutes(naive - 86_400_000, timeZone), offsetMinutes(naive, timeZone), offsetMinutes(naive + 86_400_000, timeZone)]);
  const candidates = Array.from(offsets)
    .map((offset) => new Date(naive - offset * 60_000).toISOString())
    .filter((iso, index, all) => zonedLocalValue(iso, timeZone) === local && all.indexOf(iso) === index)
    .sort();
  if (candidates.length === 0) return { error: `That ${city} local time does not exist because of the DST clock change.` };
  const iso = disambiguation === "later" ? candidates[candidates.length - 1] : candidates[0];
  return { iso, ambiguous: candidates.length > 1 };
}

export function stockholmLocalValue(iso: string): string {
  return zonedLocalValue(iso, STOCKHOLM_TZ);
}

export function stockholmLabel(iso: string): string {
  return zonedLabel(iso, STOCKHOLM_TZ);
}

export function stockholmLocalToIso(
  local: string,
  disambiguation: "earlier" | "later" = "earlier",
): { iso?: string; error?: string; ambiguous?: boolean } {
  return zonedLocalToIso(local, STOCKHOLM_TZ, disambiguation);
}
