/**
 * Contract v0.8.0 settings flow, admin side: the demo stores (Pricing's ZoneBook, Dispatch's ZoneDispatch, the app
 * documents' parts) as the server's config documents and back, and the calls that save and publish them
 * (GET/PUT /admin/config/{doc}, POST …/publish and …/use-standard). Pure functions, so node --test covers them.
 *
 * Owner 2026-10-27: a zone without its own settings uses its country's Standard ("Uses standard"); publishing has no
 * second admin; tips, raise steps and driver bonus limits are country rules (country_rules).
 */
import contractJson from "../../../contracts/contract.json" with { type: "json" };
import type { ChatSettings } from "../config/chatSettings.ts";
import type { CurrencyCode, Money } from "../domain/money.ts";
import { fromMajor } from "../domain/money.ts";
import { marketOfZone } from "../markets/markets.ts";
import type { CategoryPrice, ZoneBook } from "../pricing/zonePricing.ts";
import type { CommissionStep } from "../pricing/commissionSteps.ts";
import { MIN_TRIP_METERS } from "../pricing/zonePricing.ts";
import type { ZoneDispatch } from "../dispatch/rules.ts";

export type ConfigDocName = "rider_app_config" | "driver_app_config" | "pricing" | "dispatch" | "country_rules" | "onboarding";
export type Doc = Record<string, unknown>;

/** The server's scope key of a country's Standard and country rules (contract.json#configDocs.standard). */
export const STANDARD_PREFIX = "standard-";
export const standardKey = (country: string) => `${STANDARD_PREFIX}${country}`;
export const countryOfStandard = (id: string): string | null => (/^standard-([A-Z]{2})$/.exec(id)?.[1] ?? null);

/** ?zoneId= for a zone, ?country= for a Standard. */
export function scopeOf(id: string): { zoneId: string } | { country: string } {
  const country = countryOfStandard(id);
  return country ? { country } : { zoneId: id };
}

const toMinor = (major: number, currency: CurrencyCode): Money => fromMajor(major, currency);
const toMajor = (money: unknown, factor: number, fallback: number): number => {
  const amount = (money as Money | null | undefined)?.amountMinor;
  return typeof amount === "number" ? amount / factor : fallback;
};

export type ZoneFacts = { id: string; currency: CurrencyCode; country: string; timeZone: string; factor: number };

/** The zone's (or Standard's) currency, country and time zone from the admin's markets. */
export function zoneFacts(id: string): ZoneFacts {
  const market = marketOfZone(id);
  if (!market) throw new RangeError(`Unknown zone ${id}`);
  return { id, currency: market.currency as CurrencyCode, country: market.id, timeZone: market.timeZone, factor: market.minorUnits };
}

/* ---------------------------------------------------------------- pricing */

const SEAT_CATEGORY = "child_seat";

function categoryDoc(price: CategoryPrice, commissionPct: number, commissionSteps: readonly CommissionStep[], riderFee: ZoneBook["pickupPay"]["rates"][string]["riderFee"] | undefined, id: string, currency: CurrencyCode): Doc {
  const fee = (own: { on: boolean; amount: number } | undefined) => (own?.on ? toMinor(own.amount, currency) : null);
  return {
    enabled: price.enabled,
    base: toMinor(price.base, currency),
    perKm: toMinor(price.perKm, currency),
    perMin: toMinor(price.perMin, currency),
    minimum: toMinor(price.minimum, currency),
    maximum: price.maximum > 0 ? toMinor(price.maximum, currency) : null,
    appFeePct: price.appFeePct,
    commissionPct,
    // J5b (contract v0.18.86, supervisor must-fix 2/3): always written, [] when there are none, the whole list
    // otherwise (a list without ids is one value for patchChanged, so "Remove all steps" really sends []).
    commissionSteps: commissionSteps.map((step) => ({ ...step })),
    extraStopFee: toMinor(price.extraStopFee, currency),
    stopWaitPerMin: toMinor(price.stopWaitPerMin, currency),
    // v0.7.1 (owner 2026-10-27): ONE seat fee, only on Child Seat.
    ...(id === SEAT_CATEGORY ? { childSeatFee: toMinor(price.childSeatFee, currency) } : {}),
    waiting: { freeWaitMin: price.freeWaitMin, perMin: toMinor(price.waitPerMin, currency), noShowAfterMin: price.freeWaitMin, noShowFee: toMinor(price.noShowFee, currency) },
    riderPickupFee: { live: fee(riderFee?.live), reservation: fee(riderFee?.reservation) },
  };
}

/**
 * PricingDocument (CONTRACT.md §6.2) from the Pricing page's book. Fields the page has no control for (the surge
 * maximum, the free minutes at a stop) keep the server's value (`base`). version and publishedAt are the server's.
 */
export function pricingDocumentOf(book: ZoneBook, id: string, base: Doc | null): Doc {
  const facts = zoneFacts(id);
  const c = facts.currency;
  const prior = (base ?? {}) as { surge?: Doc; version?: number; publishedAt?: string };
  return {
    version: prior.version ?? 1,
    publishedAt: prior.publishedAt ?? new Date(0).toISOString(),
    zoneId: id,
    currency: c,
    country: facts.country,
    timeZone: facts.timeZone,
    priceStep: toMinor(book.fees.rounding, c),
    categories: Object.fromEntries(Object.entries(book.prices).map(([cid, price]) => [cid, categoryDoc(price, book.commission[cid] ?? 20, book.commissionSteps?.[cid] ?? [], book.pickupPay.rates[cid]?.riderFee, cid, c)])),
    fees: {
      airportPickup: toMinor(book.fees.airportPickup, c),
      airportDropoff: toMinor(book.fees.airportDropoff, c),
      reservationFee: toMinor(book.fees.reservationFee, c),
      cleaningFee: toMinor(book.fees.cleaningFee, c),
      tollsPassThrough: book.fees.tollsPassThrough,
    },
    fixedRoutes: book.routes.map((route) => ({ id: route.id, from: route.from, to: route.to, categoryId: route.categoryId, price: toMinor(route.price, c) })),
    // v0.7.1: no separate surge maximum (each slider is its own maximum). v0.7.2 (owner 2026-10-28): no surge notice
    // to drivers, so no notifyDrivers (contract.json#surgeNoticeRemoved).
    surge: {
      smart: structuredClone(book.smart),
      scheduled: structuredClone(book.scheduled),
    },
    // v0.18.44 §67: written only when the server document has it or the admin changed it from the contract default, so
    // an untouched zone republishes the same document (the server reads a missing value as 0 = off, owner Q9).
    ...(base && "minTripMeters" in base) || book.fees.minTripMeters !== MIN_TRIP_METERS.default ? { minTripMeters: book.fees.minTripMeters } : {},
  };
}

/**
 * Pricing keys the contract removed that a server document may still carry from an older admin. Owner 2026-10-29 "if
 * there is any % u delete that" (contract v0.18.13 fleetShareRemoved, v0.18.88 fleetPayoutWhole: removed, ignored): a
 * publish never writes them back, so the fleet-owner % leaves the zone's document at its next publish.
 */
export const REMOVED_PRICING_KEYS = ["fleetCommissionPct"] as const;

/** The pricing document to send: without the keys the contract removed. */
export function withoutRemovedPricingKeys(doc: Doc): Doc {
  const next = { ...doc };
  for (const key of REMOVED_PRICING_KEYS) delete next[key];
  return next;
}

/** The book the Pricing page shows for a server pricing document: the document's values over `fallback`. */
export function bookOfPricing(doc: Doc, fallback: ZoneBook): ZoneBook {
  const facts = zoneFacts(fallback.zoneId);
  const f = facts.factor;
  const categories = (doc["categories"] ?? {}) as Record<string, Doc>;
  const book = structuredClone(fallback);
  for (const [cid, cat] of Object.entries(categories)) {
    const own = book.prices[cid];
    if (!own) continue;
    const waiting = (cat["waiting"] ?? {}) as Doc;
    book.prices[cid] = {
      ...own,
      enabled: Boolean(cat["enabled"]),
      base: toMajor(cat["base"], f, own.base),
      perKm: toMajor(cat["perKm"], f, own.perKm),
      perMin: toMajor(cat["perMin"], f, own.perMin),
      minimum: toMajor(cat["minimum"], f, own.minimum),
      maximum: cat["maximum"] === null ? 0 : toMajor(cat["maximum"], f, own.maximum),
      appFeePct: typeof cat["appFeePct"] === "number" ? cat["appFeePct"] : own.appFeePct,
      extraStopFee: toMajor(cat["extraStopFee"], f, own.extraStopFee),
      stopWaitPerMin: toMajor(cat["stopWaitPerMin"], f, own.stopWaitPerMin),
      childSeatFee: cid === SEAT_CATEGORY ? toMajor(cat["childSeatFee"], f, own.childSeatFee) : 0,
      freeWaitMin: typeof waiting["freeWaitMin"] === "number" ? waiting["freeWaitMin"] : own.freeWaitMin,
      waitPerMin: toMajor(waiting["perMin"], f, own.waitPerMin),
      noShowFee: toMajor(waiting["noShowFee"], f, own.noShowFee),
    };
    if (typeof cat["commissionPct"] === "number") book.commission[cid] = cat["commissionPct"];
    // J5b: the server's steps (absent / null = none). Kept as the contract's shape, minor units.
    const steps = cat["commissionSteps"];
    book.commissionSteps = { ...book.commissionSteps, [cid]: Array.isArray(steps) ? (structuredClone(steps) as CommissionStep[]) : [] };
    const rate = book.pickupPay.rates[cid];
    const rider = cat["riderPickupFee"] as { live?: Money | null; reservation?: Money | null } | undefined;
    if (rate && rider) {
      rate.riderFee = {
        live: rider.live ? { on: true, amount: rider.live.amountMinor / f } : { ...rate.riderFee.live, on: false },
        reservation: rider.reservation ? { on: true, amount: rider.reservation.amountMinor / f } : { ...rate.riderFee.reservation, on: false },
      };
    }
  }
  const fees = (doc["fees"] ?? {}) as Doc;
  book.fees = {
    ...book.fees,
    airportPickup: toMajor(fees["airportPickup"], f, book.fees.airportPickup),
    airportDropoff: toMajor(fees["airportDropoff"], f, book.fees.airportDropoff),
    reservationFee: toMajor(fees["reservationFee"], f, book.fees.reservationFee),
    cleaningFee: toMajor(fees["cleaningFee"], f, book.fees.cleaningFee),
    tollsPassThrough: typeof fees["tollsPassThrough"] === "boolean" ? fees["tollsPassThrough"] : book.fees.tollsPassThrough,
    rounding: toMajor(doc["priceStep"], f, book.fees.rounding),
    minTripMeters: wholeIn(doc["minTripMeters"], MIN_TRIP_METERS.min, MIN_TRIP_METERS.max) ?? book.fees.minTripMeters,
  };
  const routes = doc["fixedRoutes"] as Array<{ id: string; from: string; to: string; categoryId: string; price: Money }> | undefined;
  if (Array.isArray(routes)) book.routes = routes.map((route) => ({ id: route.id, from: route.from, to: route.to, categoryId: route.categoryId, price: route.price.amountMinor / f }));
  const surge = doc["surge"] as { smart?: ZoneBook["smart"]; scheduled?: ZoneBook["scheduled"] } | undefined;
  if (surge?.smart) book.smart = structuredClone(surge.smart);
  if (surge?.scheduled) book.scheduled = structuredClone(surge.scheduled);
  // contract v0.18.88 fleetPayoutWhole: an old document's fleet-owner % key is ignored (never read, never written back).
  if (typeof doc["version"] === "number") book.version = doc["version"];
  return book;
}

/* ---------------------------------------------------------------- dispatch */

/**
 * v0.18.11 start / limits / neighbours. A server document without one of them (written before v0.18.11) gets it only
 * when the admin set something other than the default: an untouched zone then publishes the same document as before,
 * so publishing another part (e.g. the driver's cancel share) does not re-publish unchanged dispatch rules.
 */
function startOrderParts(zone: ZoneDispatch, base: Doc | null): Doc {
  const parts: Doc = {
    start: { mode: zone.start.mode, nearKm: zone.start.nearKm },
    // v0.18.39 §63: farReachKm only when it is not the contract default (an untouched zone republishes the same limits).
    limits: { ...(zone.limits.maxPickupKm > 0 ? { maxPickupKm: zone.limits.maxPickupKm } : {}), maxPickupEtaMin: zone.limits.maxPickupEtaMin, ...(zone.limits.farReachKm !== N2_DEFAULTS.farReachKm || base === null || hasKey(base, "limits", "farReachKm") ? { farReachKm: zone.limits.farReachKm } : {}) },
    neighbours: { on: zone.neighbours.on, zoneIds: [...zone.neighbours.zoneIds], ...(zone.neighbours.afterStep > 0 ? { afterStep: zone.neighbours.afterStep } : {}) },
  };
  if (base === null) return parts;
  const defaults: Doc = { start: { mode: "auto", nearKm: 2 }, limits: { maxPickupEtaMin: 0 }, neighbours: { on: false, zoneIds: [] } };
  for (const key of Object.keys(parts)) if (!(key in base) && JSON.stringify(parts[key]) === JSON.stringify(defaults[key])) delete parts[key];
  return parts;
}

const N2_DEFAULTS = (contractJson as unknown as { noDriverNearby: { defaults: { noDriverNearby: { on: boolean; afterSec: number; message: string }; farReachKm: number; reaskLimit: number } } }).noDriverNearby.defaults;
const hasKey = (base: Doc, key: string, sub: string) => typeof base[key] === "object" && base[key] !== null && sub in (base[key] as object);
function n2Parts(zone: ZoneDispatch, base: Doc | null): Doc {
  const nd = { on: zone.noDriverNearby.on, afterSec: zone.noDriverNearby.afterSec, message: zone.noDriverNearby.message };
  const out: Doc = {};
  if (base === null || "reaskLimit" in base || zone.reaskLimit !== N2_DEFAULTS.reaskLimit) out["reaskLimit"] = zone.reaskLimit;
  if (base === null || "noDriverNearby" in base || JSON.stringify(nd) !== JSON.stringify(N2_DEFAULTS.noDriverNearby)) out["noDriverNearby"] = nd;
  return out;
}

/** DispatchDocument (CONTRACT.md §6.3) from the zone's Dispatch rules (admin field names). */
export function dispatchDocumentOf(zone: ZoneDispatch, id: string, base: Doc | null): Doc {
  const facts = zoneFacts(id);
  const prior = (base ?? {}) as { version?: number; publishedAt?: string };
  return {
    version: prior.version ?? 1,
    publishedAt: prior.publishedAt ?? new Date(0).toISOString(),
    zoneId: id,
    country: facts.country,
    timeZone: facts.timeZone,
    radar: { on: zone.radar.on, drivers: zone.radar.drivers, seconds: zone.radar.seconds, then: zone.radar.then, ...(zone.radar.steps?.length ? { steps: [...zone.radar.steps] } : {}) },
    exclusive: { on: zone.exclusive.on, drivers: zone.exclusive.drivers, seconds: zone.exclusive.seconds, then: zone.exclusive.then, ...(zone.exclusive.steps?.length ? { steps: [...zone.exclusive.steps] } : {}) },
    // choose.backup is deprecated (v0.18.11, never used); still sent so a server on an older contract copy accepts the document.
    choose: { ...structuredClone(zone.choose), backup: zone.choose.backup ?? (zone.choose.main === "radar" ? "exclusive" : "radar") },
    // v0.18.11 (owner 2026-11-01, rule 16): what starts first, pickup limits and neighbour zones (0 = contract default, left out).
    ...startOrderParts(zone, base),
    rulesFrom: zone.rulesFrom,
    radius: structuredClone(zone.radius),
    factors: structuredClone(zone.factors),
    finishing: { exclusive: zone.finishing.exclusive, withinMin: zone.finishing.withinMin, withinKm: zone.finishing.withinKm },
    favourite: { on: zone.favourite.on, maxKm: zone.favourite.maxKm },
    exclusiveWhileDriving: { ...zone.exclusiveWhileDriving },
    // v0.18.33 (fix job 5, owner Q7): booked ride next for a driver on a trip.
    bookedNext: { on: zone.bookedNext.on, withinMin: zone.bookedNext.withinMin },
    // v0.18.39 §63 (owner N2): "No driver nearby" once, afterSec after the search started (live rides).
    // v0.18.39 §63: like start/limits, written only when the server document has it or the admin changed it from the default.
    ...n2Parts(zone, base),
    waiting: zone.waiting.map((step) => ({ id: step.id, kind: step.kind, on: step.on, afterMin: step.afterMin, message: step.message, extraMin: step.extraMin ?? null })),
    // v0.18.6 (owner G4-E4): the rider raise limit; publishing it also writes the zone's rider app config (server).
    raisePrice: { maxFactor: zone.raisePrice.maxFactor },
  };
}

export { SECONDS_DEFAULT, rulesOfDispatch, reservationOfDriverDoc } from "./dispatchDoc.ts";

/** The parts of the rider and driver documents each admin page owns; publishing a page writes only its parts. */
export const OWNED: Record<"dispatch" | "settings" | "content", { rider: string[]; driver: string[] }> = {
  dispatch: { rider: ["booking", "cancelFees", "cancelCheck", "cancelReasons", "shareTrip"], driver: ["booking", "offers", "cancelFees", "waiting", "pickupPin", "destinationMode", "nextTrips", "reservations", "cancelReasons", "drivingLimits", "rideCheck", "routeChange", "headingCheck", "realtime"] },
  settings: { rider: ["features", "appUpdate"], driver: ["features", "appUpdate"] },
  content: { rider: [], driver: ["texts", "notices"] },
};

/** The parts of the rider and driver documents one publish writes; `riderServerKeeps` (dotted paths inside them) stay the server's. */
export type OwnedParts = { rider: string[]; driver: string[]; riderServerKeeps?: string[] };

/**
 * BQ-S10 round 2 (supervisor SF-A1): the parts a Dispatch publish of one zone writes. The Share trip switch (S10) and
 * the pickup entrance chips switch (V21, booking.pickupSpots) live in the rider document; when that read failed
 * (`riderRead` false) the page only shows the browser's own values, so `shareTrip` is left out and
 * `booking.pickupSpots` stays the server's (the rest of `booking` is still written): a zone switched off cannot come
 * back on. (S10 admin rebase over V21: before, pickupSpots was still published after a failed read.)
 */
export function dispatchOwnedFor(riderRead: boolean): OwnedParts {
  return riderRead ? OWNED.dispatch : { ...OWNED.dispatch, rider: OWNED.dispatch.rider.filter((key) => key !== "shareTrip"), riderServerKeeps: ["booking.pickupSpots"] };
}

/**
 * `after` with each dotted path in `paths` set back to its value in `before` (removed when `before` has none or is
 * null), so a publish built from them leaves those paths as the server has them.
 */
export function keepPaths(after: Doc, before: Doc | null, paths: readonly string[]): Doc {
  const next: Doc = structuredClone(after);
  for (const path of paths) {
    const parts = path.split(".");
    const last = parts.pop()!;
    let into: unknown = next;
    let from: unknown = before;
    for (const part of parts) {
      into = isPlain(into) ? into[part] : undefined;
      from = isPlain(from) ? from[part] : undefined;
    }
    if (!isPlain(into)) continue;
    if (isPlain(from) && last in from) into[last] = structuredClone(from[last]);
    else delete into[last];
  }
  return next;
}

/** `server` with `keys` taken from `built` (the admin exporter's full document). The waiting money stays the server's (pricing keeps it, §6.2). */
export function withOwned(server: Doc, built: Doc, keys: readonly string[]): Doc {
  const next: Doc = structuredClone(server);
  for (const key of keys) {
    if (!(key in built)) continue;
    if (key === "waiting") {
      const own = (server["waiting"] ?? {}) as Doc;
      const made = built["waiting"] as Doc;
      // v0.18.7 (G5 Q2): the cancel-after-arrived switch is the admin's; the money stays pricing's (servedConfig).
      // v0.18.8 (G6): the free wait at each stop (Dispatch › Rides › Stops) is the admin's too.
      next["waiting"] = { ...own, driverSharePct: made["driverSharePct"], driverShareWaitPct: made["driverShareWaitPct"], cancelAfterArrivedIsNoShow: made["cancelAfterArrivedIsNoShow"], farPickup: made["farPickup"], rideTypes: made["rideTypes"], stopFreeWaitMin: made["stopFreeWaitMin"],
        // v0.18.93 (job C9, contract.json#autoArrive): the auto-arrive and leave distances are the admin's too.
        ...(made["autoArriveMeters"] !== undefined ? { autoArriveMeters: made["autoArriveMeters"], leaveMeters: made["leaveMeters"] } : {}) };
      continue;
    }
    if (key === "headingCheck") {
      // v0.18.35 FIX JOB 4: the panel owns the notice and reassign (always false, owner Q-A).
      // BQ-V22 (owner G5-8 "80 % default, admin can change"): and the heading numbers; SV: and `on` (the Smart cancel check switch).
      const own = (server["headingCheck"] ?? {}) as Doc;
      const made = built["headingCheck"] as Doc;
      next["headingCheck"] = { ...own, on: made["on"], headingPct: made["headingPct"], notHeadingMinutes: made["notHeadingMinutes"], reassign: false, notice: made["notice"], noticeEveryMin: made["noticeEveryMin"] };
      continue;
    }
    next[key] = structuredClone(built[key]);
  }
  delete next["usesStandard"];
  return next;
}

const META_KEYS = new Set(["version", "publishedAt", "usesStandard"]);

/** The waiting parts the admin owns (the money stays pricing's, see withOwned). */
const WAITING_OWNED = ["driverSharePct", "driverShareWaitPct", "cancelAfterArrivedIsNoShow", "farPickup", "rideTypes", "stopFreeWaitMin", "autoArriveMeters", "leaveMeters"] as const;

const isPlain = (value: unknown): value is Doc => typeof value === "object" && value !== null && !Array.isArray(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The key of a list item: lists of objects that all carry an id (or a code) are patched item by item. */
const KEY_FIELDS = ["id", "code", "category", "kind"] as const;
function itemKey(list: readonly unknown[]): string | null {
  if (!list.length) return null;
  // Checker: a key must be unique inside each list, else two items would merge into one (e.g. two rows of one kind).
  return KEY_FIELDS.find((field) => list.every((item) => isPlain(item) && (typeof item[field] === "string" || typeof item[field] === "number"))) ?? null;
}
function uniqueBy(items: readonly unknown[], field: string): boolean {
  return new Set(items.map((item) => String((item as Doc)[field]))).size === items.length;
}

function applyList(target: unknown, before: readonly unknown[], after: readonly unknown[]): unknown {
  const field = itemKey([...before, ...after]);
  const server = Array.isArray(target) ? target : null;
  // A list without keys (or one the server does not hold as a keyed list) is one value: the admin's, as changed.
  if (!field || !server || (server.length && itemKey(server) !== field)) return structuredClone(after);
  // Checker: a key repeated in any of the lists → treat the list as one value (never merge two items).
  if (!uniqueBy(before, field) || !uniqueBy(after, field) || !uniqueBy(server, field)) return structuredClone(after);
  const id = (item: unknown) => String((item as Doc)[field]);
  const was = new Map(before.map((item) => [id(item), item]));
  const now = new Map(after.map((item) => [id(item), item]));
  const next: unknown[] = [];
  for (const item of server) {
    const key = id(item);
    if (was.has(key) && !now.has(key)) continue; // removed by the admin
    next.push(now.has(key) ? applyChanges(item, was.get(key), now.get(key)) : item);
  }
  for (const [key, item] of now) if (!was.has(key) && !server.some((own) => id(own) === key)) next.push(structuredClone(item)); // added by the admin
  // Checker: the admin reordered the list (same keys, new order) → follow the admin's order; items only the server holds stay at the end.
  const order = (list: readonly unknown[]) => list.map(id).join("\u0000");
  if (order(before.filter((item) => now.has(id(item)))) !== order(after.filter((item) => was.has(id(item))))) {
    const rank = new Map(after.map((item, index) => [id(item), index]));
    next.sort((a, b) => (rank.get(id(a)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(id(b)) ?? Number.MAX_SAFE_INTEGER));
  }
  return next;
}

/** `target` with every leaf where `after` differs from `before` set to `after`'s value; a missing `before` counts as empty. */
function applyChanges(target: unknown, before: unknown, after: unknown): unknown {
  if (same(before, after)) return target;
  if (Array.isArray(after)) return applyList(target, Array.isArray(before) ? before : [], after);
  if (!isPlain(after)) return structuredClone(after);
  const was: Doc = isPlain(before) ? before : {};
  const next: Doc = isPlain(target) ? { ...target } : {};
  for (const key of new Set([...Object.keys(was), ...Object.keys(after)])) {
    if (same(was[key], after[key])) continue;
    if (after[key] === undefined) delete next[key];
    else next[key] = applyChanges(next[key], was[key], after[key]);
  }
  return next;
}

/**
 * Live sweep 2026-11-02 H1: publishing one Dispatch rule rewrote unrelated live settings (booking horizon, cancel
 * reasons, the driver document's rest minutes…) because the owned parts were copied whole from the admin's model,
 * where fields the page never shows hold defaults. Now the server's document is the start and ONLY what the admin
 * changed is written: `before` and `after` are the admin's exporter output for the state before and after the edit;
 * a leaf that is the same in both is left exactly as the server has it.
 */
export function patchChanged(server: Doc, before: Doc, after: Doc, keys?: readonly string[]): Doc {
  const pick = (doc: Doc, key: string): unknown => {
    const value = doc[key];
    if (key !== "waiting" || !isPlain(value)) return value;
    return Object.fromEntries(WAITING_OWNED.filter((part) => part in value).map((part) => [part, value[part]]));
  };
  let next: Doc = structuredClone(server);
  for (const key of keys ?? [...new Set([...Object.keys(before), ...Object.keys(after)])]) {
    if (META_KEYS.has(key)) continue;
    const b = pick(before, key);
    const a = pick(after, key);
    if (same(b, a)) continue;
    next = { ...next };
    if (a === undefined) delete next[key];
    else next[key] = applyChanges(next[key], b, a);
  }
  delete next["usesStandard"];
  return next;
}

/** Equal for publishing: the server's stamps and marks do not count. */
export function sameDocument(a: Doc, b: Doc): boolean {
  const strip = (doc: Doc) => JSON.stringify({ ...doc, version: 0, publishedAt: "", usesStandard: undefined });
  return strip(a) === strip(b);
}

/* ---------------------------------------------------------------- country rules */

export type CountryRulesInput = { tips: number[]; raiseSteps: number[]; driverBonus: { defaultLimit: number; hardMax: number }; driverPayChangeMax?: number; personLimits?: { savedPlacesPerPerson: number; emergencyContactsPerPerson: number }; onTripMinDonePct?: number; chainLateFreeCancelMin?: number; walletCreditMax?: number; bonusCampaignMax?: number; maxRiderDebt?: number; driverOwesLimit?: { enabled: boolean; max: number | null }; calls?: { on: boolean; mode: "in_app" | "phone"; callWindowAfterTripMin: number; ringSeconds: number; maxCallMin: number; connectTimeoutSeconds?: number }; dontMatchAgain?: { on: boolean; atStars: number }; chat?: ChatSettings; emergencyNumbers?: Array<{ kind: string; number: string; label: { sv: string; fr: string; en: string } }>; sosContactsSms?: boolean; smsSignIn?: { enabled: boolean; dailyCap: number; requireDeviceCheck?: boolean } };

/**
 * F1 (MONEY, Rules audits/impact/f1-tips-save-payout-mode.md): the keys of a country_rules document the Tips & limits
 * panel writes. countryRulesOf writes each of these from the panel's values exactly as before (a key the panel leaves
 * out is not sent); every OTHER key of the stored document is kept as it is. Before, the document was rebuilt from a
 * fixed list and the server stores what it is sent, so Finance › Payouts settings' payoutMode and payoutSchedule (same
 * document) were dropped by every Tips & limits Save: a manual country went back to automatic, Monday 08:00.
 */
export const COUNTRY_RULES_PANEL_KEYS = ["version", "publishedAt", "country", "currency", "tips", "raiseSteps", "driverBonus", "driverPayChangeMax", "onTripOffers", "limits", "walletCreditMax", "bonusCampaignMax", "calls", "chat", "dontMatchAgain", "emergencyNumbers", "sosContactsSms", "smsSignIn"] as const;

/**
 * Kept from the stored document on a country Standard only. A zone's base can be its Standard's document (a zone
 * that uses the Standard gets its own here), and these are the Standard's: the server reads the payout keys from the
 * Standard only (contract payoutSchedule "read from the country standard only"; J9 v0.18.84 maxRiderDebt and
 * driverOwesLimit: "the country standard only; a zone's own value is ignored") and refuses the SOS / emergency keys
 * on a zone (400 *_country_only). The panel's own Standard-only keys (walletCreditMax, emergencyNumbers,
 * sosContactsSms, smsSignIn) are in COUNTRY_RULES_PANEL_KEYS and only sent on the Standard by the caller.
 */
export const COUNTRY_RULES_STANDARD_ONLY_KEPT = ["payoutMode", "payoutSchedule", "maxRiderDebt", "driverOwesLimit"] as const;

/** Never stored in a document: the server's marks on a read. */
const COUNTRY_RULES_READ_MARKS = ["usesStandard", "zoneId"] as const;

/**
 * CountryRules (CONTRACT.md §6.5) from the Tips & limits panel's values (major units). `standard`: the document is the
 * country Standard's (false for a zone's own rules).
 */
export function countryRulesOf(country: string, currency: CurrencyCode, input: CountryRulesInput, base: Doc | null, { standard = true }: { standard?: boolean } = {}): Doc {
  const option = (amount: number) => ({ amount: toMinor(amount, currency), enabled: true });
  const drop = new Set<string>([...COUNTRY_RULES_PANEL_KEYS, ...COUNTRY_RULES_READ_MARKS, ...(standard ? [] : COUNTRY_RULES_STANDARD_ONLY_KEPT)]);
  const kept = structuredClone(Object.fromEntries(Object.entries(base ?? {}).filter(([key]) => !drop.has(key)))) as Doc;
  // U2 (Rules audits/impact/safe-config-saves.md, SAFETY): a block the panel writes starts from the stored block, so a
  // key the panel does not show (calls.adminCallRoles, calls.phoneProvider, ...) is kept; the panel's own keys win.
  const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const stored = (key: string) => { const value = base?.[key]; return plain(value) ? structuredClone(value) : {}; };
  // SF-2: two levels for a block with objects inside (chat.autoArrived, chat.quickReplies): an object the panel writes
  // starts from the stored object of the same key, so a stored key inside it is kept too; lists and values are the panel's.
  const storedDeep = (key: string, panel: Record<string, unknown>) => {
    const kept = stored(key);
    return { ...kept, ...Object.fromEntries(Object.entries(panel).map(([name, value]) => { const inner = kept[name]; return [name, plain(value) && plain(inner) ? { ...inner, ...value } : value]; })) };
  };
  return {
    ...kept,
    version: (base?.["version"] as number | undefined) ?? 1,
    publishedAt: (base?.["publishedAt"] as string | undefined) ?? new Date(0).toISOString(),
    country,
    currency,
    tips: input.tips.map(option),
    raiseSteps: input.raiseSteps.map(option),
    driverBonus: { ...stored("driverBonus"), defaultLimit: toMinor(input.driverBonus.defaultLimit, currency), hardMax: toMinor(input.driverBonus.hardMax, currency) },
    // v0.18.10 checker: the largest single change of a driver's pay (Change pay on the trip page).
    ...(input.driverPayChangeMax !== undefined ? { driverPayChangeMax: toMinor(input.driverPayChangeMax, currency) } : {}),
    // v0.18.26: the country's other limits (sign-in codes, uploads) are kept; the per-person ones come from the panel.
    // v0.18.33 (owner 2026-11-05): Exclusives to a driver on a trip only after this % of his route.
    ...(input.onTripMinDonePct !== undefined || input.chainLateFreeCancelMin !== undefined
      ? { onTripOffers: { ...stored("onTripOffers"), minRouteDonePct: input.onTripMinDonePct ?? 70, lateFreeCancelMin: input.chainLateFreeCancelMin ?? 10 } }
      : {}),
    ...(base?.["limits"] || input.personLimits ? { limits: { ...((base?.["limits"] as Record<string, unknown> | undefined) ?? {}), ...(input.personLimits ?? {}) } } : {}),
    // v0.18.29 A2 (fix job 0) (owner G12 Q-D): the largest single Add money to wallet.
    ...(input.walletCreditMax !== undefined ? { walletCreditMax: toMinor(input.walletCreditMax, currency) } : {}),
    // S5 J9 (v0.18.84 debtModel): Max rider debt and the driver owes-limit, on the country standard only. The document is
    // rebuilt from these inputs, so the standard's save always sends both (a field left out is dropped).
    ...(input.maxRiderDebt !== undefined ? { maxRiderDebt: toMinor(input.maxRiderDebt, currency) } : {}),
    ...(input.driverOwesLimit ? { driverOwesLimit: { enabled: input.driverOwesLimit.enabled, max: input.driverOwesLimit.max !== null && input.driverOwesLimit.max > 0 ? toMinor(input.driverOwesLimit.max, currency) : null } } : {}),
    // v0.18.110 BQ-V44: the largest driver bonus campaign (per country standard or zone; the server refuses above it).
    ...(input.bonusCampaignMax !== undefined ? { bonusCampaignMax: toMinor(input.bonusCampaignMax, currency) } : base?.["bonusCampaignMax"] ? { bonusCampaignMax: base["bonusCampaignMax"] } : {}),
    // v0.18.38 §62 (fix job 8): Tips & limits › Calls; a save without it keeps the stored block.
    ...(input.calls ? { calls: { ...stored("calls"), ...input.calls } } : base?.["calls"] ? { calls: base["calls"] } : {}),
    // v0.18.56 §78 (G9 part 2): Tips & limits › Chat; a save without it keeps the stored block.
    ...(input.chat ? { chat: storedDeep("chat", JSON.parse(JSON.stringify(input.chat)) as ChatSettings) } : base?.["chat"] ? { chat: base["chat"] } : {}),
    // v0.18.43 §64 (fix job 10): Tips & limits › Don't match again; a save without it keeps the stored block.
    ...(input.dontMatchAgain ? { dontMatchAgain: { ...stored("dontMatchAgain"), ...input.dontMatchAgain } } : base?.["dontMatchAgain"] ? { dontMatchAgain: base["dontMatchAgain"] } : {}),
    // v0.18.57 §79: Tips & limits › Emergency numbers, on the country standard only (a zone's own rules never carry it).
    ...(input.emergencyNumbers ? { emergencyNumbers: input.emergencyNumbers.map((row) => ({ kind: row.kind, number: row.number, label: { ...row.label } })) } : {}),
    // v0.18.101 §92 (BQ-V34): the SMS to the driver's emergency contacts on SOS, on the country standard only (a zone's own rules → 400 sos_sms_country_only).
    ...(input.sosContactsSms !== undefined ? { sosContactsSms: input.sosContactsSms } : {}),
    // v0.18.133 (contract.json#smsSignIn): real SMS sign-in codes and the daily SMS limit, on the country standard only (a zone's own rules → 400 sms_sign_in_country_only).
    ...(input.smsSignIn !== undefined ? { smsSignIn: { enabled: input.smsSignIn.enabled === true, dailyCap: input.smsSignIn.dailyCap, requireDeviceCheck: input.smsSignIn.requireDeviceCheck === true } } : {}),
  };
}

/* ---------------------------------------------------------------- the calls */

export type Draft = { version: number; liveVersion: number; usesStandard?: boolean; document: Doc };

export type ConfigHttp = {
  json: <T>(path: string) => Promise<T>;
  put: <T>(path: string, body: unknown) => Promise<T>;
  post: <T>(path: string, body: unknown) => Promise<T>;
  /** DELETE with a fresh Idempotency-Key (v0.18.6 dispatch tools); optional so older test fakes still fit. */
  del?: (path: string) => Promise<unknown>;
};

/** A 409 from the server: someone changed the settings since this page read them. */
export class SettingsChanged extends Error {
  constructor() {
    super("The settings changed since you opened them. Reload the page and make your change again.");
  }
}

const query = (id: string) => {
  const scope = scopeOf(id);
  return "country" in scope ? `country=${scope.country}` : `zoneId=${encodeURIComponent(scope.zoneId)}`;
};

const isStatus = (error: unknown, status: number) => (error as { status?: number } | null)?.status === status;

export async function readDraft(http: ConfigHttp, doc: ConfigDocName, id: string): Promise<Draft | null> {
  try {
    return await http.json<Draft>(`/admin/config/${doc}?${query(id)}`);
  } catch (error) {
    // Only "nothing published yet" is an empty answer; any other 404 (a zone or country the server does not
    // know) is the caller's to remember.
    const reason = (error as { reason?: string | null } | null)?.reason;
    if (isStatus(error, 404) && reason === "config_not_found") return null;
    throw error;
  }
}

/**
 * Saves `document` as the draft and publishes it at once (no second admin, v0.8.0). Nothing is sent when the server
 * already has the same live document. A 409 becomes SettingsChanged. `note` goes into the publish (History and the
 * audit keep it): a Tips & limits save names itself there, so its documents can be undone together (live/tipsUndo.ts).
 */
export async function savePublish(http: ConfigHttp, doc: ConfigDocName, id: string, draft: Draft | null, document: Doc, note?: string): Promise<{ version: number } | null> {
  if (draft && draft.liveVersion > 0 && !draft.usesStandard && sameDocument(draft.document, document)) return null;
  const scope = scopeOf(id);
  try {
    const saved = await http.put<Draft>(`/admin/config/${doc}`, { expectedVersion: draft?.version ?? 1, ...scope, document });
    return await http.post<{ version: number }>(`/admin/config/${doc}/publish`, { expectedVersion: saved.version, ...scope, ...(note ? { note } : {}) });
  } catch (error) {
    if (isStatus(error, 409)) throw new SettingsChanged();
    throw error;
  }
}

/**
 * G3 (owner: "every admin setting must work on live"): an app document's draft and live versions count apart, so
 * "draft version 3, live version 1" alone does not mean unpublished. What drivers get is the live document: compare
 * with it. `live` is the scope's newest published document (a Doc), null when the scope has none of its own, or
 * undefined when the server cannot say (a country Standard has no history read): then a server draft row (version
 * above 1) may hold unpublished changes, so it is published rather than skipped.
 */
export async function savePublishLive(http: ConfigHttp, doc: ConfigDocName, id: string, draft: Draft | null, document: Doc, live: Doc | null | undefined, note?: string): Promise<{ version: number } | null> {
  if (draft && draft.liveVersion > 0 && !draft.usesStandard) {
    if (live && sameDocument(live, document)) return null;
    // G7 live fix 2: a zone whose live document could not be read (a slow server) is published, never skipped: the
    // skip answered "Published." while the drivers did not get the change. Only a Standard has no history to read.
    if (live === undefined && countryOfStandard(id) && draft.version <= 1 && sameDocument(draft.document, document)) return null;
  }
  // The skip is decided above; savePublish only takes the draft's version from here.
  return savePublish(http, doc, id, draft ? { ...draft, liveVersion: 0 } : null, document, note);
}


/** The top-level parts that differ between a draft and the live document (keys only, never values). */
export function unpublishedKeys(draft: Doc, live: Doc): string[] {
  const keys = new Set([...Object.keys(draft), ...Object.keys(live)]);
  return [...keys].filter((key) => !META_KEYS.has(key) && JSON.stringify(draft[key]) !== JSON.stringify(live[key])).sort();
}

/** The newest published document of a zone (GET …/history?zoneId&limit=1); undefined for a Standard or when unreadable. */
export async function liveDocumentOf(http: ConfigHttp, doc: ConfigDocName, id: string): Promise<Doc | null | undefined> {
  if (countryOfStandard(id)) return undefined;
  const page = await http.json<{ items?: HistoryEntry[] }>(`/admin/config/${doc}/history?zoneId=${encodeURIComponent(id)}&limit=1`).catch(() => undefined);
  if (!page) return undefined;
  return page.items?.[0]?.document ?? null;
}

/** Owner 2026-10-28: Dispatch "Spara utkast" keeps the draft on the server without making it live. */
export async function saveDraftOnly(http: ConfigHttp, doc: ConfigDocName, id: string, draft: Draft | null, document: Doc): Promise<{ version: number } | null> {
  if (draft && sameDocument(draft.document, document)) return null;
  try {
    return await http.put<{ version: number }>(`/admin/config/${doc}`, { expectedVersion: draft?.version ?? 1, ...scopeOf(id), document });
  } catch (error) {
    if (isStatus(error, 409)) throw new SettingsChanged();
    throw error;
  }
}

/** A published version as History shows it (contract.json#pricingHistory, any document). */
export type HistoryEntry = { version: number; publishedAt: string; publishedBy?: string; note?: string; action: "publish" | "restore"; restoredFrom?: number; document: Doc };

/** Owner 2026-10-28: Dispatch "Ångra" publishes an earlier version again (POST /admin/config/{doc}/restore). */
export async function restoreVersion(http: ConfigHttp, doc: ConfigDocName, zoneId: string, version: number, liveVersion: number): Promise<{ version: number }> {
  try {
    return await http.post<{ version: number }>(`/admin/config/${doc}/restore`, { zoneId, version, expectedVersion: liveVersion });
  } catch (error) {
    if (isStatus(error, 409)) throw new SettingsChanged();
    throw error;
  }
}

/** Go back to Standard (contract.json#configDocs.useStandard): the zone's own document goes, kept in the history. */
export async function goBackToStandard(http: ConfigHttp, doc: ConfigDocName, zoneId: string, draft: Draft): Promise<{ version: number }> {
  try {
    return await http.post<{ version: number }>(`/admin/config/${doc}/use-standard`, { zoneId, expectedVersion: draft.version });
  } catch (error) {
    if (isStatus(error, 409)) throw new SettingsChanged();
    throw error;
  }
}

/** v0.18.44 §67: a whole number inside [min, max], else null. */
function wholeIn(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}
