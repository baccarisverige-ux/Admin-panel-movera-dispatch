import { COUNTRY_SETTINGS_KEY, countrySettingsOf, driverBonusHardMax, normalizeCountrySettingsBook } from "../config/countrySettings.ts";
import { liveDrivers } from "../dashboard/live.ts";
import { CATEGORIES, DRIVER_ASSIGNED_STATUSES, nextStatus } from "../domain/contract.ts";
import { DISPATCH_KEY, liveRules, normalizeDispatchBook } from "../dispatch/rules.ts";
import {
  ADMIN_DISPATCH_KEY,
  addDriverBonus,
  advanceAdminDispatch,
  directAssign,
  nearbyDrivers,
  normalizeAdminDispatch,
  openOffers,
  radarGroup,
  tripDispatch,
  type AdminDispatchBook,
  type AdminOffer,
  type AssignContext,
  type AssignResult,
  type BonusLimits,
  type DispatchEvent,
  type NearbyDriver,
  type NearbyQuery,
  type RadarGroup,
  type TripDispatch,
} from "../dispatch/assign.ts";
import { driverOps, emptyDriverOpsBook, type DriverOpsBook } from "../drivers/ops.ts";
import { formatMoney, market } from "../markets/markets.ts";
import { normalizeStore, zoneBook, SLICE_KEY as PRICING_KEY } from "../pricing/zonePricing.ts";
import { countryOf, moneySplit, routeOf } from "../trips/file.ts";
import { categoryOf } from "../trips/present.ts";
import { saveDb } from "./demoStore.ts";
import type { DemoDb, DemoRecord } from "./seed.ts";

/**
 * The demo server's side of the admin assign tool (contract §3.1): it builds the offers from the command, keeps them
 * in the `adminDispatch` slice, and plays the drivers' answers (dispatch/assign.ts demoReply) as time passes.
 * Driver answers are not admin actions: they change the trip without a new store revision and are not audited;
 * they are in the dispatch events (GET /admin/dispatch/stream).
 */

export type TripOffersView = {
  tripId: string;
  status: string;
  currency: string;
  offers: AdminOffer[];
  groups: RadarGroup[];
  bonusMinor: number;
  priority: boolean;
  lockedTo: TripDispatch["lockedTo"];
  events: DispatchEvent[];
  timers: { exclusiveSeconds: number; radarSeconds: number };
  limits: BonusLimits;
  /** The fare the rider pays and the driver's net before any bonus, from Pricing (an estimate until the ride ends). */
  fareMinor: number;
  driverNetMinor: number;
  /** Movera's commission on the ride, from which the bonus is paid. */
  commissionMinor: number;
};

export type NearbyDriverList = { scope: NearbyQuery["scope"]; radiusKm?: number; items: NearbyDriver[] };

export function dispatchBook(db: DemoDb): AdminDispatchBook {
  return normalizeAdminDispatch(db.slices[ADMIN_DISPATCH_KEY]);
}

/**
 * Demo positions of the online drivers. A driver who took a trip through the assign tool is busy with it
 * (heading to the pickup) until that trip ends, so the demo never offers them a second ride meanwhile.
 */
function live(db: DemoDb) {
  const busy = new Set(Object.entries(dispatchBook(db).trips).flatMap(([tripId, trip]) => {
    const row = trip.lockedTo ? db.trips.find((item) => item.id === tripId) : undefined;
    return row && trip.lockedTo && row.driverId === trip.lockedTo.driverId && (DRIVER_ASSIGNED_STATUSES as readonly string[]).includes(row.status) ? [trip.lockedTo.driverId] : [];
  }));
  return liveDrivers(db.drivers, db.vehicles, db.trips, db.incidents, 0).map((driver) => (busy.has(driver.id) && driver.state === "free" ? { ...driver, state: "pickup" as const } : driver));
}

export function bonusLimits(db: DemoDb, zoneId: string): BonusLimits {
  const country = countryOf(zoneId);
  const minor = market(country).minorUnits;
  const settings = countrySettingsOf(normalizeCountrySettingsBook(db.slices[COUNTRY_SETTINGS_KEY]), country);
  const hardMaxMinor = Math.round(driverBonusHardMax(country) * minor);
  return { limitMinor: Math.min(hardMaxMinor, Math.round(settings.driverBonusLimit * minor)), hardMaxMinor };
}

export function zoneTimers(db: DemoDb, zoneId: string) {
  const rules = liveRules(normalizeDispatchBook(db.slices[DISPATCH_KEY]), zoneId);
  return { exclusiveSeconds: rules.exclusive.seconds, radarSeconds: rules.radar.seconds };
}

function context(db: DemoDb, trip: DemoRecord, by: string, now: string): AssignContext {
  const country = countryOf(trip.zoneId);
  const driver = db.drivers.find((row) => row.id === trip.driverId);
  const split = moneySplit(trip, zoneBook(normalizeStore(db.slices[PRICING_KEY]), trip.zoneId), Boolean(driver?.fleetId), []);
  const free = new Set(live(db).filter((row) => row.state === "free").map((row) => row.id));
  return {
    tripId: trip.id,
    tripStatus: trip.status,
    currency: market(country).currency,
    fareMinor: split.price,
    driverNetMinor: split.driverGets,
    ...zoneTimers(db, trip.zoneId),
    now,
    by,
    nameOf: (id) => db.drivers.find((row) => row.id === id)?.name,
    canTake: (id) => free.has(id),
  };
}

const minorOf = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined);

/**
 * One assign tool command, rebuilt on the server from its parameters (never the client's book):
 * `admin.trip.assign {driverId, driverBonusMinor?, priority?}`, `admin.trip.radarGroup {driverIds, driverBonusMinor?, priority?}`,
 * `admin.trip.driverBonus {amountMinor, priority}`.
 */
export function dispatchCommand(db: DemoDb, trip: DemoRecord, action: string, params: unknown, by: string, now: string): AssignResult {
  const book = dispatchBook(db);
  const ctx = context(db, trip, by, now);
  const sent = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  const country = countryOf(trip.zoneId);
  const limits = bonusLimits(db, trip.zoneId);
  const format = (minor: number) => formatMoney(minor, country);
  const extra = minorOf(sent.driverBonusMinor) ?? 0;
  const priority = typeof sent.priority === "boolean" ? sent.priority : undefined;
  if (action === "admin.trip.driverBonus") return addDriverBonus(book, ctx, minorOf(sent.amountMinor) ?? Number.NaN, priority ?? true, limits, format);
  if (extra) {
    const checked = addDriverBonus(book, ctx, extra, priority ?? true, limits, format);
    if (checked.error) return checked;
  }
  const options = { driverBonusMinor: extra, ...(priority === undefined ? {} : { priority }) };
  if (action === "admin.trip.assign") return directAssign(book, ctx, typeof sent.driverId === "string" ? sent.driverId : "", options);
  const ids = Array.isArray(sent.driverIds) ? sent.driverIds.filter((id): id is string => typeof id === "string") : [];
  return radarGroup(book, ctx, ids, options);
}

/**
 * Plays the demo forward to `now` and stores what changed: offer answers in the slice, and the trip's status
 * (accepted with the winning driver, or back to searching when every offer ended without an accept).
 */
export function advanceDemoDispatch(db: DemoDb, now = new Date().toISOString()): DemoDb {
  const book = dispatchBook(db);
  if (!Object.values(book.trips).some((trip) => trip.offers.some((offer) => offer.status === "open"))) return db;
  const result = advanceAdminDispatch(book, now, (id) => db.trips.find((row) => row.id === id)?.status);
  if (result.book === book) return db;
  const trips = db.trips.map((row) => {
    const change = result.changes.find((item) => item.tripId === row.id);
    if (!change) return row;
    if (change.to === "accepted") {
      const to = nextStatus(row.status, "accept", "driver");
      return to ? { ...row, status: to, previousStatus: row.status, driverId: change.driverId } : row;
    }
    const to = nextStatus(row.status, "offer_lapsed", "system");
    return to ? { ...row, status: to, previousStatus: row.status, driverId: null } : row;
  });
  return saveDb({ ...db, trips, slices: { ...db.slices, [ADMIN_DISPATCH_KEY]: result.book } });
}

export function tripOffersView(db: DemoDb, trip: DemoRecord): TripOffersView {
  const state = tripDispatch(dispatchBook(db), trip.id);
  const ctx = context(db, trip, "", new Date().toISOString());
  return {
    tripId: trip.id,
    status: trip.status,
    currency: market(countryOf(trip.zoneId)).currency,
    offers: state.offers,
    groups: state.groups,
    bonusMinor: state.bonusMinor,
    priority: state.priority,
    lockedTo: state.lockedTo,
    events: dispatchBook(db).events.filter((event) => event.tripId === trip.id),
    timers: zoneTimers(db, trip.zoneId),
    limits: bonusLimits(db, trip.zoneId),
    fareMinor: ctx.fareMinor,
    driverNetMinor: ctx.driverNetMinor,
    commissionMinor: ctx.fareMinor - ctx.driverNetMinor,
  };
}

export function nearbyFor(db: DemoDb, trip: DemoRecord, query: NearbyQuery): NearbyDriverList {
  const ops = (db.slices.driverOps as DriverOpsBook | undefined)?.drivers ? (db.slices.driverOps as DriverOpsBook) : emptyDriverOpsBook();
  const state = tripDispatch(dispatchBook(db), trip.id);
  const open = new Map(openOffers(state).map((offer) => [offer.driverId, offer.offerId]));
  const items = nearbyDrivers(routeOf(trip).stops[0].at, trip.zoneId, categoryOf(trip.id).id, live(db), query, (id) => {
    const record = db.drivers.find((row) => row.id === id);
    if (!record) return { rating: 0, categoryIds: [] };
    const info = driverOps(ops, { id: record.id, name: record.name, fleetId: record.fleetId, status: record.status, kind: record.kind });
    return { rating: info.ratings.stars, categoryIds: CATEGORIES.filter((category) => info.categories[category.id]).map((category) => category.id) };
  }, (id) => open.get(id));
  return { scope: query.scope, ...(query.scope === "radius" ? { radiusKm: query.radiusKm } : {}), items };
}
