import type { LiveDriver } from "../dashboard/live.ts";
import type { LatLng } from "../dashboard/route.ts";
import { DRIVER_ASSIGNED_STATUSES, TERMINAL_STATUSES } from "../domain/contract.ts";
import type { CurrencyCode } from "../domain/money.ts";
import { marketOfZone, zoneById } from "../markets/markets.ts";

/**
 * The admin assign tool (owner Q13–Q18, contract.json#adminDispatch, CONTRACT.md §3.1).
 *
 * - Direct assign: one exclusive offer (kind `assigned`, source `admin`) to one driver, on the zone's exclusive timer.
 * - Radar group: one `radar` offer per chosen driver (1 to 10) with the same groupId, on the zone's radar timer.
 *   Groups can be sent again and again while the trip is not locked.
 * - Lock: the first driver to accept wins; every other open offer is withdrawn (claimed_elsewhere) and the trip
 *   moves to `accepted`. From then on assign and radar-group are `409 invalid_transition`.
 * - Driver bonus ("Add money for driver"): Movera pays it, the rider never does. It is included in the offer's fare
 *   and driver earnings as the driver sees them, and `priority` shows the red "Priority" badge.
 *
 * Pure functions: the demo fixture server (api/create.ts) keeps the book in the `adminDispatch` slice and runs them;
 * the real backend must do the same checks.
 */

export const ADMIN_DISPATCH_KEY = "adminDispatch";

/** contract.json#adminDispatch.radarGroup */
export const RADAR_GROUP_MIN = 1;
export const RADAR_GROUP_MAX = 10;
/** contract.json#adminDispatch.nearbyRadiusPresetsKm */
export const RADIUS_PRESETS_KM = [5, 7, 10] as const;
/** contract.json#adminDispatch.nearbyScopes */
export const NEARBY_SCOPES = ["radius", "zone", "zone_and_neighbours"] as const;
export type NearbyScope = (typeof NEARBY_SCOPES)[number];
/** contract.json#adminDispatch.lockedStatuses: once a driver accepted (or the trip ended) nobody can be assigned. */
export const LOCKED_STATUSES: readonly string[] = [...DRIVER_ASSIGNED_STATUSES, ...TERMINAL_STATUSES];
/** contract.json#adminDispatch.eventKinds */
export const EVENT_KINDS = ["offer_sent", "offer_declined", "offer_expired", "offer_withdrawn", "offer_accepted", "assignment_locked", "driver_bonus_added"] as const;
export type DispatchEventKind = (typeof EVENT_KINDS)[number];
/** contract.json#offerStatus */
export const OFFER_STATUSES = ["open", "claimed", "claimed_elsewhere", "declined", "expired", "withdrawn"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/** Custom radius: the contract's nearby-drivers range. */
export const RADIUS_MIN_KM = 0.1;
export const RADIUS_MAX_KM = 100;
/** Neighbouring zones: other zones of the same country whose centre is at most this far from the trip's zone centre. */
export const NEIGHBOUR_KM = 15;
/** Demo average speed to the pickup, for the ETA. */
const PICKUP_KMH = 24;

/**
 * The status words of an offer, in the admin's words, from the contract (event kinds offer_sent, offer_declined,
 * offer_expired, offer_withdrawn, offer_accepted; offer statuses open, claimed, declined, expired, withdrawn,
 * claimed_elsewhere).
 */
export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  open: "Sent",
  claimed: "Accepted",
  claimed_elsewhere: "Withdrawn (taken by another driver)",
  declined: "Declined",
  expired: "Expired",
  withdrawn: "Withdrawn",
};

export const EVENT_LABEL: Record<DispatchEventKind, string> = {
  offer_sent: "Offer sent",
  offer_declined: "Offer declined",
  offer_expired: "Offer expired",
  offer_withdrawn: "Offer withdrawn",
  offer_accepted: "Offer accepted",
  assignment_locked: "Assignment locked",
  driver_bonus_added: "Money added for the driver",
};

export type AdminOffer = {
  offerId: string;
  tripId: string;
  driverId: string;
  driverName: string;
  /** `assigned` for a direct assign, `radar` for a radar group (contract OfferKind). */
  kind: "assigned" | "radar";
  status: OfferStatus;
  source: "admin";
  groupId?: string;
  version: number;
  sentAt: string;
  expiresAt: string;
  answeredAt?: string;
  currency: CurrencyCode;
  /** The fare as the driver sees it, the driver bonus included (contract Offer.fare). */
  fareMinor: number;
  /** The driver's net, the driver bonus included (contract Offer.driverEarnings). */
  driverEarningsMinor: number;
  driverBonusMinor: number;
  priority: boolean;
  by: string;
};

export type RadarGroup = { groupId: string; tripId: string; number: number; driverIds: string[]; sentAt: string; expiresAt: string; by: string };

export type DispatchEvent = {
  eventId: string;
  sequence: number;
  kind: DispatchEventKind;
  tripId: string;
  groupId?: string;
  offerId?: string;
  driverId?: string;
  driverName?: string;
  amountMinor?: number;
  occurredAt: string;
};

export type TripDispatch = {
  offers: AdminOffer[];
  groups: RadarGroup[];
  /** Total money added for the driver on this trip (minor units of the zone's currency). */
  bonusMinor: number;
  priority: boolean;
  lockedTo: { driverId: string; driverName: string; at: string } | null;
};

export type AdminDispatchBook = { seq: number; trips: Record<string, TripDispatch>; events: DispatchEvent[] };

const EVENTS_KEPT = 400;

export function emptyAdminDispatch(): AdminDispatchBook {
  return { seq: 0, trips: {}, events: [] };
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function emptyTripDispatch(): TripDispatch {
  return { offers: [], groups: [], bonusMinor: 0, priority: false, lockedTo: null };
}

/** Stored data is checked, not cast: anything unreadable starts empty. */
export function normalizeAdminDispatch(value: unknown): AdminDispatchBook {
  if (!isObject(value) || !isObject(value.trips)) return emptyAdminDispatch();
  const trips: Record<string, TripDispatch> = {};
  for (const [id, raw] of Object.entries(value.trips)) {
    if (!isObject(raw)) continue;
    trips[id] = {
      offers: Array.isArray(raw.offers) ? (raw.offers as AdminOffer[]).filter((offer) => isObject(offer) && typeof offer.offerId === "string" && (OFFER_STATUSES as readonly string[]).includes(String(offer.status))) : [],
      groups: Array.isArray(raw.groups) ? (raw.groups as RadarGroup[]).filter((group) => isObject(group) && typeof group.groupId === "string" && Array.isArray(group.driverIds)) : [],
      bonusMinor: typeof raw.bonusMinor === "number" && Number.isFinite(raw.bonusMinor) && raw.bonusMinor >= 0 ? raw.bonusMinor : 0,
      priority: raw.priority === true,
      lockedTo: isObject(raw.lockedTo) && typeof raw.lockedTo.driverId === "string" ? (raw.lockedTo as TripDispatch["lockedTo"]) : null,
    };
  }
  return {
    seq: typeof value.seq === "number" && Number.isFinite(value.seq) ? value.seq : 0,
    trips,
    events: Array.isArray(value.events) ? (value.events as DispatchEvent[]).filter((event) => isObject(event) && typeof event.sequence === "number" && (EVENT_KINDS as readonly string[]).includes(String(event.kind))) : [],
  };
}

export function tripDispatch(book: AdminDispatchBook, tripId: string): TripDispatch {
  return book.trips[tripId] ?? emptyTripDispatch();
}

export function isLocked(status: string): boolean {
  return LOCKED_STATUSES.includes(status);
}

/** Whether the admin may assign now (contract: assign from requested, searching or offered). */
export function canAssign(status: string): boolean {
  return status === "requested" || status === "searching" || status === "offered";
}

export function openOffers(trip: TripDispatch): AdminOffer[] {
  return trip.offers.filter((offer) => offer.status === "open");
}

/* ------------------------------------------------------------------ nearby drivers */

export type NearbyDriver = {
  driverId: string;
  name: string;
  /** contract DriverOnlineStatus: free drivers are `online`, drivers heading to a pickup or carrying a rider `on_trip`. */
  onlineStatus: "online" | "on_trip";
  distanceMeters: number;
  pickupEtaSeconds: number;
  zoneId: string;
  zoneName: string;
  categoryIds: string[];
  /** The trip's category is one this driver may drive. */
  categoryOk: boolean;
  rating: number;
  /** The open admin offer this driver has for the trip, if any. */
  openOfferId?: string;
};

export type NearbyQuery = { scope: NearbyScope; radiusKm?: number };

export function distanceMeters(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** The zones next to a zone: same country, centre within NEIGHBOUR_KM. The zone itself is not in the list. */
export function neighbourZones(zoneId: string): string[] {
  const zone = zoneById(zoneId);
  const place = marketOfZone(zoneId);
  if (!zone || !place) return [];
  return place.zones.filter((other) => other.id !== zoneId && distanceMeters(zone.center, other.center) <= NEIGHBOUR_KM * 1000).map((other) => other.id);
}

/** A custom radius must be a number in the contract's range. */
export function radiusIssue(radiusKm: number): string | null {
  if (!Number.isFinite(radiusKm)) return "Type a distance in km.";
  if (radiusKm < RADIUS_MIN_KM || radiusKm > RADIUS_MAX_KM) return `The distance must be ${RADIUS_MIN_KM} to ${RADIUS_MAX_KM} km.`;
  return null;
}

/**
 * Active drivers near the pickup, nearest first; drivers who may drive the trip's category come first.
 * Drivers without a fresh position (no GPS) and SOS drivers are left out.
 */
export function nearbyDrivers(
  pickup: LatLng,
  zoneId: string,
  categoryId: string,
  drivers: readonly LiveDriver[],
  query: NearbyQuery,
  facts: (driverId: string) => { rating: number; categoryIds: string[] },
  openOfferOf: (driverId: string) => string | undefined = () => undefined,
): NearbyDriver[] {
  const zones = query.scope === "zone" ? [zoneId] : query.scope === "zone_and_neighbours" ? [zoneId, ...neighbourZones(zoneId)] : null;
  const radius = query.scope === "radius" ? (query.radiusKm ?? RADIUS_PRESETS_KM[0]) * 1000 : Infinity;
  return drivers
    .filter((driver) => driver.state === "free" || driver.state === "pickup" || driver.state === "trip")
    .map((driver): NearbyDriver => {
      const meters = distanceMeters([driver.lat, driver.lng], pickup);
      const info = facts(driver.id);
      const openOfferId = openOfferOf(driver.id);
      return {
        driverId: driver.id,
        name: driver.name,
        onlineStatus: driver.state === "free" ? "online" : "on_trip",
        distanceMeters: meters,
        pickupEtaSeconds: Math.max(60, Math.round(((meters / 1000) / PICKUP_KMH) * 3600 / 60) * 60),
        zoneId: driver.zoneId,
        zoneName: driver.zoneName,
        categoryIds: info.categoryIds,
        categoryOk: info.categoryIds.includes(categoryId),
        rating: info.rating,
        ...(openOfferId ? { openOfferId } : {}),
      };
    })
    .filter((driver) => (zones ? zones.includes(driver.zoneId) : driver.distanceMeters <= radius))
    .sort((a, b) => Number(b.onlineStatus === "online") - Number(a.onlineStatus === "online") || Number(b.categoryOk) - Number(a.categoryOk) || a.distanceMeters - b.distanceMeters);
}

/** "650 m" under 1 km, "4.2 km" above (owner Q20). */
export function distanceLabel(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

/* ------------------------------------------------------------------ sending offers */

export type AssignContext = {
  tripId: string;
  tripStatus: string;
  currency: CurrencyCode;
  /** The trip fare the rider pays (minor units). */
  fareMinor: number;
  /** The driver's net before any bonus (fare minus Movera's commission). */
  driverNetMinor: number;
  exclusiveSeconds: number;
  radarSeconds: number;
  now: string;
  by: string;
  nameOf: (driverId: string) => string | undefined;
  /** The driver can get an offer now (active, online, not on a trip). */
  canTake: (driverId: string) => boolean;
};

export type AssignOptions = { driverBonusMinor?: number; priority?: boolean };

export type AssignResult = { book: AdminDispatchBook; error?: string; code?: "invalid_transition" | "invalid_request"; offers: AdminOffer[]; group?: RadarGroup };

function event(book: AdminDispatchBook, entry: Omit<DispatchEvent, "eventId" | "sequence">): AdminDispatchBook {
  const sequence = book.seq + 1;
  return { ...book, seq: sequence, events: [...book.events, { ...entry, eventId: `ade-${sequence}`, sequence }].slice(-EVENTS_KEPT) };
}

function plusSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

function refuseLocked(book: AdminDispatchBook, status: string): AssignResult | null {
  if (canAssign(status)) return null;
  return {
    book,
    offers: [],
    code: "invalid_transition",
    error: isLocked(status) ? "A driver has already accepted this trip. It cannot be assigned again." : `The trip is ${status}: it cannot be assigned.`,
  };
}

function sendOffers(book: AdminDispatchBook, ctx: AssignContext, driverIds: readonly string[], kind: "assigned" | "radar", options: AssignOptions): AssignResult {
  const locked = refuseLocked(book, ctx.tripStatus);
  if (locked) return locked;
  const current = tripDispatch(book, ctx.tripId);
  const unknown = driverIds.find((id) => !ctx.nameOf(id));
  if (unknown) return { book, offers: [], code: "invalid_request", error: `Driver ${unknown} was not found.` };
  const busy = driverIds.find((id) => !ctx.canTake(id));
  if (busy) return { book, offers: [], code: "invalid_request", error: `${ctx.nameOf(busy)} is not online and free right now.` };
  const already = driverIds.find((id) => openOffers(current).some((offer) => offer.driverId === id));
  if (already) return { book, offers: [], code: "invalid_request", error: `${ctx.nameOf(already)} already has an open offer for this trip.` };
  const extra = Math.max(0, Math.round(options.driverBonusMinor ?? 0));
  const bonusMinor = current.bonusMinor + extra;
  const priority = options.priority ?? current.priority;
  const seconds = kind === "assigned" ? ctx.exclusiveSeconds : ctx.radarSeconds;
  const expiresAt = plusSeconds(ctx.now, seconds);
  const number = current.groups.length + 1;
  const groupId = kind === "radar" ? `${ctx.tripId}-G${number}` : undefined;
  const count = current.offers.length;
  const offers: AdminOffer[] = driverIds.map((driverId, index) => ({
    offerId: `${ctx.tripId}-O${count + index + 1}`,
    tripId: ctx.tripId,
    driverId,
    driverName: ctx.nameOf(driverId)!,
    kind,
    status: "open",
    source: "admin",
    ...(groupId ? { groupId } : {}),
    version: 1,
    sentAt: ctx.now,
    expiresAt,
    currency: ctx.currency,
    fareMinor: ctx.fareMinor + bonusMinor,
    driverEarningsMinor: ctx.driverNetMinor + bonusMinor,
    driverBonusMinor: bonusMinor,
    priority,
    by: ctx.by,
  }));
  const group: RadarGroup | undefined = groupId ? { groupId, tripId: ctx.tripId, number, driverIds: [...driverIds], sentAt: ctx.now, expiresAt, by: ctx.by } : undefined;
  // A bonus sent with the offers also raises the open offers already out (offer_updated).
  const raised = extra > 0 ? current.offers.map((offer) => (offer.status === "open" ? { ...offer, fareMinor: ctx.fareMinor + bonusMinor, driverEarningsMinor: ctx.driverNetMinor + bonusMinor, driverBonusMinor: bonusMinor, priority, version: offer.version + 1 } : offer)) : current.offers;
  let next: AdminDispatchBook = {
    ...book,
    trips: { ...book.trips, [ctx.tripId]: { ...current, offers: [...raised, ...offers], groups: group ? [...current.groups, group] : current.groups, bonusMinor, priority, lockedTo: null } },
  };
  if (extra > 0) next = event(next, { kind: "driver_bonus_added", tripId: ctx.tripId, amountMinor: extra, occurredAt: ctx.now });
  for (const offer of offers) next = event(next, { kind: "offer_sent", tripId: ctx.tripId, offerId: offer.offerId, driverId: offer.driverId, driverName: offer.driverName, ...(groupId ? { groupId } : {}), occurredAt: ctx.now });
  return { book: next, offers, ...(group ? { group } : {}) };
}

/** Direct assign: an exclusive offer to one driver (Q16), who accepts or declines. */
export function directAssign(book: AdminDispatchBook, ctx: AssignContext, driverId: string, options: AssignOptions = {}): AssignResult {
  if (!driverId) return { book, offers: [], code: "invalid_request", error: "Choose a driver." };
  return sendOffers(book, ctx, [driverId], "assigned", options);
}

/** Radar group: 1 to 10 drivers on the zone's radar timer (Q13–Q15). Can be repeated until a driver accepts. */
export function radarGroup(book: AdminDispatchBook, ctx: AssignContext, driverIds: readonly string[], options: AssignOptions = {}): AssignResult {
  const unique = [...new Set(driverIds)];
  if (unique.length !== driverIds.length) return { book, offers: [], code: "invalid_request", error: "A driver is in the list twice." };
  if (unique.length < RADAR_GROUP_MIN) return { book, offers: [], code: "invalid_request", error: "Choose at least one driver for the radar." };
  if (unique.length > RADAR_GROUP_MAX) return { book, offers: [], code: "invalid_request", error: `A radar group has at most ${RADAR_GROUP_MAX} drivers.` };
  return sendOffers(book, ctx, unique, "radar", options);
}

/* ------------------------------------------------------------------ driver bonus */

export type BonusLimits = { limitMinor: number; hardMaxMinor: number };

export type BonusIssue = { code: "invalid" | "over_limit" | "over_hard_max"; message: string };

/**
 * Q17: the total added to one trip may not pass the country's limit (Pricing › Tips & limits), and the limit never
 * passes the hard max. Above the limit the admin is sent to Pricing.
 */
export function bonusIssue(addMinor: number, alreadyMinor: number, limits: BonusLimits, format: (minor: number) => string): BonusIssue | null {
  if (!Number.isFinite(addMinor) || !Number.isInteger(addMinor) || addMinor <= 0) return { code: "invalid", message: "Type an amount above 0." };
  const total = alreadyMinor + addMinor;
  if (total > limits.hardMaxMinor) return { code: "over_hard_max", message: `Above the hard max of ${format(limits.hardMaxMinor)} per trip. No limit can go higher.` };
  if (total > limits.limitMinor) return { code: "over_limit", message: `Above the limit of ${format(limits.limitMinor)} per trip: adjust the limit in Pricing.` };
  return null;
}

export function addDriverBonus(book: AdminDispatchBook, ctx: AssignContext, addMinor: number, priority: boolean, limits: BonusLimits, format: (minor: number) => string): AssignResult {
  if (!canAssign(ctx.tripStatus)) return { book, offers: [], code: "invalid_transition", error: `Money can be added only while the trip is requested, searching or offered (it is ${ctx.tripStatus}).` };
  const current = tripDispatch(book, ctx.tripId);
  const issue = bonusIssue(addMinor, current.bonusMinor, limits, format);
  if (issue) return { book, offers: [], code: "invalid_request", error: issue.message };
  const bonusMinor = current.bonusMinor + addMinor;
  const offers = current.offers.map((offer) => (offer.status === "open" ? { ...offer, fareMinor: ctx.fareMinor + bonusMinor, driverEarningsMinor: ctx.driverNetMinor + bonusMinor, driverBonusMinor: bonusMinor, priority, version: offer.version + 1 } : offer));
  const next = { ...book, trips: { ...book.trips, [ctx.tripId]: { ...current, offers, bonusMinor, priority } } };
  return { book: event(next, { kind: "driver_bonus_added", tripId: ctx.tripId, amountMinor: addMinor, occurredAt: ctx.now }), offers: offers.filter((offer) => offer.status === "open") };
}

/* ------------------------------------------------------------------ simulated driver replies (demo only) */

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export type DemoReply = { answer: "accept" | "decline" | "none"; afterSeconds: number };

/**
 * How a demo driver answers an admin offer: always the same for one driver, so the demo (and its tests) can be
 * followed. About a third accept, a third decline and a third never answer (the offer expires).
 */
export function demoReply(driverId: string): DemoReply {
  const value = hash(`reply:${driverId}`);
  const answer = (["accept", "decline", "none"] as const)[value % 3];
  return { answer, afterSeconds: 3 + ((value >>> 5) % 3) };
}

export type TripChange = { tripId: string; to: "accepted"; driverId: string } | { tripId: string; to: "searching" };

/**
 * Moves the demo forward to `now`: drivers decline, offers expire, and the first driver to accept wins (lock).
 * `statusOf` is the trip's stored status. Returns the trip status changes the server must store:
 * `accepted` with the winner, or `searching` when every offer of an offered trip ended without an accept
 * (contract offer_lapsed). A trip that left the assignable statuses (cancelled, reassigned…) loses its open offers.
 */
export function advanceAdminDispatch(book: AdminDispatchBook, now: string, statusOf: (tripId: string) => string | undefined): { book: AdminDispatchBook; changes: TripChange[] } {
  const at = Date.parse(now);
  const changes: TripChange[] = [];
  let next = book;
  for (const [tripId, trip] of Object.entries(book.trips)) {
    if (!trip.offers.some((offer) => offer.status === "open")) continue;
    const status = statusOf(tripId);
    let offers = trip.offers;
    let lockedTo = trip.lockedTo;
    const pending: Omit<DispatchEvent, "eventId" | "sequence">[] = [];
    if (!status || !canAssign(status)) {
      offers = offers.map((offer) => {
        if (offer.status !== "open") return offer;
        pending.push({ kind: "offer_withdrawn", tripId, offerId: offer.offerId, driverId: offer.driverId, driverName: offer.driverName, ...(offer.groupId ? { groupId: offer.groupId } : {}), occurredAt: now });
        return { ...offer, status: "withdrawn" as const, answeredAt: now, version: offer.version + 1 };
      });
    } else {
      const answerAt = (offer: AdminOffer) => Date.parse(offer.sentAt) + demoReply(offer.driverId).afterSeconds * 1000;
      const winner = offers
        .filter((offer) => offer.status === "open" && demoReply(offer.driverId).answer === "accept" && answerAt(offer) <= at && answerAt(offer) < Date.parse(offer.expiresAt))
        .sort((a, b) => answerAt(a) - answerAt(b) || a.offerId.localeCompare(b.offerId))[0];
      offers = offers.map((offer) => {
        if (offer.status !== "open") return offer;
        const reply = demoReply(offer.driverId);
        const answered = new Date(Math.min(answerAt(offer), at)).toISOString();
        if (reply.answer === "decline" && answerAt(offer) <= at && answerAt(offer) < Date.parse(offer.expiresAt) && (!winner || answerAt(offer) < answerAt(winner))) {
          pending.push({ kind: "offer_declined", tripId, offerId: offer.offerId, driverId: offer.driverId, driverName: offer.driverName, ...(offer.groupId ? { groupId: offer.groupId } : {}), occurredAt: answered });
          return { ...offer, status: "declined" as const, answeredAt: answered, version: offer.version + 1 };
        }
        if (winner && offer.offerId === winner.offerId) return offer;
        if (winner && answerAt(winner) < Date.parse(offer.expiresAt)) {
          const when = new Date(answerAt(winner)).toISOString();
          pending.push({ kind: "offer_withdrawn", tripId, offerId: offer.offerId, driverId: offer.driverId, driverName: offer.driverName, ...(offer.groupId ? { groupId: offer.groupId } : {}), occurredAt: when });
          return { ...offer, status: "claimed_elsewhere" as const, answeredAt: when, version: offer.version + 1 };
        }
        if (Date.parse(offer.expiresAt) <= at) {
          pending.push({ kind: "offer_expired", tripId, offerId: offer.offerId, driverId: offer.driverId, driverName: offer.driverName, ...(offer.groupId ? { groupId: offer.groupId } : {}), occurredAt: offer.expiresAt });
          return { ...offer, status: "expired" as const, answeredAt: offer.expiresAt, version: offer.version + 1 };
        }
        return offer;
      });
      if (winner) {
        const when = new Date(answerAt(winner)).toISOString();
        offers = offers.map((offer) => (offer.offerId === winner.offerId ? { ...offer, status: "claimed" as const, answeredAt: when, version: offer.version + 1 } : offer));
        lockedTo = { driverId: winner.driverId, driverName: winner.driverName, at: when };
        pending.push({ kind: "offer_accepted", tripId, offerId: winner.offerId, driverId: winner.driverId, driverName: winner.driverName, ...(winner.groupId ? { groupId: winner.groupId } : {}), occurredAt: when });
        pending.push({ kind: "assignment_locked", tripId, driverId: winner.driverId, driverName: winner.driverName, occurredAt: when });
        changes.push({ tripId, to: "accepted", driverId: winner.driverId });
      } else if (status === "offered" && !offers.some((offer) => offer.status === "open")) {
        changes.push({ tripId, to: "searching" });
      }
    }
    if (!pending.length) continue;
    next = { ...next, trips: { ...next.trips, [tripId]: { ...trip, offers, lockedTo } } };
    for (const entry of pending.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) next = event(next, entry);
  }
  return { book: next, changes };
}

/** Seconds left on an offer or a group, never below 0. */
export function secondsLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
}

export function countdownLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
