/**
 * Contract v0.8.0 settings flow, admin side: the demo stores (Pricing's ZoneBook, Dispatch's ZoneDispatch, the app
 * documents' parts) as the server's config documents and back, and the calls that save and publish them
 * (GET/PUT /admin/config/{doc}, POST …/publish and …/use-standard). Pure functions, so node --test covers them.
 *
 * Owner 2026-10-27: a zone without its own settings uses its country's Standard ("Uses standard"); publishing has no
 * second admin; tips, raise steps and driver bonus limits are country rules (country_rules).
 */
import type { CurrencyCode, Money } from "../domain/money.ts";
import { fromMajor } from "../domain/money.ts";
import { marketOfZone } from "../markets/markets.ts";
import type { CategoryPrice, ZoneBook } from "../pricing/zonePricing.ts";
import { RIDE_CHECK_LIMITS, type ZoneDispatch } from "../dispatch/rules.ts";
import { completeOfferCard } from "../dispatch/offers.ts";
import { validPickupMove, validRaiseFactor } from "../dispatch/offerRules.ts";

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

function categoryDoc(price: CategoryPrice, commissionPct: number, riderFee: ZoneBook["pickupPay"]["rates"][string]["riderFee"] | undefined, id: string, currency: CurrencyCode): Doc {
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
    categories: Object.fromEntries(Object.entries(book.prices).map(([cid, price]) => [cid, categoryDoc(price, book.commission[cid] ?? 20, book.pickupPay.rates[cid]?.riderFee, cid, c)])),
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
    fleetCommissionPct: book.fleetCommissionPct,
  };
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
  };
  const routes = doc["fixedRoutes"] as Array<{ id: string; from: string; to: string; categoryId: string; price: Money }> | undefined;
  if (Array.isArray(routes)) book.routes = routes.map((route) => ({ id: route.id, from: route.from, to: route.to, categoryId: route.categoryId, price: route.price.amountMinor / f }));
  const surge = doc["surge"] as { smart?: ZoneBook["smart"]; scheduled?: ZoneBook["scheduled"] } | undefined;
  if (surge?.smart) book.smart = structuredClone(surge.smart);
  if (surge?.scheduled) book.scheduled = structuredClone(surge.scheduled);
  if (typeof doc["fleetCommissionPct"] === "number") book.fleetCommissionPct = doc["fleetCommissionPct"];
  if (typeof doc["version"] === "number") book.version = doc["version"];
  return book;
}

/* ---------------------------------------------------------------- dispatch */

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
    radar: { ...zone.radar },
    exclusive: { on: zone.exclusive.on, drivers: zone.exclusive.drivers, seconds: zone.exclusive.seconds, then: zone.exclusive.then },
    choose: structuredClone(zone.choose),
    rulesFrom: zone.rulesFrom,
    radius: structuredClone(zone.radius),
    factors: structuredClone(zone.factors),
    finishing: { exclusive: zone.finishing.exclusive, withinMin: zone.finishing.withinMin, withinKm: zone.finishing.withinKm },
    favourite: { on: zone.favourite.on, maxKm: zone.favourite.maxKm },
    exclusiveWhileDriving: { ...zone.exclusiveWhileDriving },
    waiting: zone.waiting.map((step) => ({ id: step.id, kind: step.kind, on: step.on, afterMin: step.afterMin, message: step.message, extraMin: step.extraMin ?? null })),
    // v0.18.6 (owner G4-E4): the rider raise limit; publishing it also writes the zone's rider app config (server).
    raisePrice: { maxFactor: zone.raisePrice.maxFactor },
  };
}

/** Contract defaults for offer seconds a document holds as 0. */
export const SECONDS_DEFAULT = { radar: 15, exclusive: 30 } as const;

/** The Dispatch rules for a server dispatch document (+ the driver document's offer and cancel-share parts) over `fallback`. */
export function rulesOfDispatch(doc: Doc | null, driver: Doc | null, fallback: ZoneDispatch): ZoneDispatch {
  const zone = structuredClone(fallback);
  if (doc) {
    const d = doc as unknown as Partial<ZoneDispatch> & { finishing?: Partial<ZoneDispatch["finishing"]>; favourite?: Partial<ZoneDispatch["favourite"]> };
    if (d.radar) zone.radar = { ...zone.radar, ...d.radar };
    if (d.exclusive) zone.exclusive = { ...zone.exclusive, ...d.exclusive };
    // Checker HIGH (live test 2026-11-01): a document holding 0 / missing seconds loads with the contract default
    // (radar 15 s, exclusive 30 s) and the editor says so; it publishes fine whether the mode is on or off.
    const defaulted: ("radar" | "exclusive")[] = [];
    if (!(Number(zone.radar.seconds) >= 1)) { zone.radar = { ...zone.radar, seconds: SECONDS_DEFAULT.radar }; defaulted.push("radar"); }
    if (!(Number(zone.exclusive.seconds) >= 1)) { zone.exclusive = { ...zone.exclusive, seconds: SECONDS_DEFAULT.exclusive }; defaulted.push("exclusive"); }
    if (defaulted.length) zone.secondsDefaulted = defaulted;
    else delete zone.secondsDefaulted;
    if (d.choose) zone.choose = structuredClone(d.choose);
    if (d.rulesFrom) zone.rulesFrom = d.rulesFrom;
    if (d.radius) zone.radius = structuredClone(d.radius);
    if (d.factors) zone.factors = structuredClone(d.factors);
    if (d.finishing) zone.finishing = { ...zone.finishing, ...d.finishing };
    if (d.favourite) zone.favourite = { ...zone.favourite, ...d.favourite };
    if (d.exclusiveWhileDriving) zone.exclusiveWhileDriving = { ...d.exclusiveWhileDriving };
    // v0.18.6 (G4-E4): the rider raise limit as the server has it; a missing or bad value keeps the contract default.
    const factor = validRaiseFactor((doc["raisePrice"] as { maxFactor?: unknown } | undefined)?.maxFactor);
    if (factor !== null) zone.raisePrice = { maxFactor: factor };
    if (Array.isArray(d.waiting)) zone.waiting = d.waiting.map((step) => ({ ...step, ...(step.extraMin === null ? { extraMin: undefined } : {}) })).map(({ extraMin, ...rest }) => (extraMin === undefined ? rest : { ...rest, extraMin }));
  }
  const offers = (driver?.["offers"] ?? null) as { radarApp?: ZoneDispatch["radarApp"]; offerCard?: unknown; autoOffline?: { on?: boolean; missedExclusive?: number; noFixMinutes?: number } } | null;
  if (offers?.radarApp) zone.radarApp = { ...zone.radarApp, ...offers.radarApp };
  // v0.18.6 (owner decision 3): the offer card switches as the zone's drivers get them (riderRating among them).
  if (offers?.offerCard && typeof offers.offerCard === "object") zone.offerCard = completeOfferCard({ ...zone.offerCard, ...(offers.offerCard as object) });
  if (offers?.autoOffline && typeof offers.autoOffline.missedExclusive === "number") zone.autoOffline = { ...zone.autoOffline, on: offers.autoOffline.on ?? true, after: offers.autoOffline.missedExclusive };
  // G3-R1 (v0.18.4): minutes without a position before the server sets the driver offline (0 = never).
  if (offers?.autoOffline && typeof offers.autoOffline.noFixMinutes === "number") zone.autoOffline = { ...zone.autoOffline, noFixMinutes: offers.autoOffline.noFixMinutes };
  const share = (driver?.["cancelFees"] as { driverSharePct?: number } | undefined)?.driverSharePct;
  if (typeof share === "number") zone.riderCancel = { ...zone.riderCancel, driverSharePct: share };
  // v0.18.7 (G5 Q2): "Cancel after the driver arrived counts as a no-show" as the zone's drivers get it (default on).
  const afterArrived = (driver?.["waiting"] as { cancelAfterArrivedIsNoShow?: unknown } | undefined)?.cancelAfterArrivedIsNoShow;
  if (typeof afterArrived === "boolean") zone.pickupWait = { ...zone.pickupWait, cancelAfterArrivedIsNoShow: afterArrived };
  // v0.18.7 (G5 item 4): the pickup move limit the server checks (booking.maxPickupMoveMeters, 0–2000; migration 0041 moved 500 to 200).
  const move = validPickupMove((driver?.["booking"] as { maxPickupMoveMeters?: unknown } | undefined)?.maxPickupMoveMeters);
  if (move !== null) zone.pickupMove = { maxMeters: move };
  // v0.18.8 (G6): the free wait at each stop the server charges by (waiting.stopFreeWaitMin, 0–20; 0 while stops are off).
  const stopFree = (driver?.["waiting"] as { stopFreeWaitMin?: unknown } | undefined)?.stopFreeWaitMin;
  if (zone.stops.on && typeof stopFree === "number" && Number.isInteger(stopFree) && stopFree >= 0 && stopFree <= 20) zone.stops = { ...zone.stops, freeWaitMin: stopFree };
  // v0.18.8 (G6): "Rider PIN before Start" as the zone's drivers get it (pickupPin; default off, 5 tries, 5 min).
  const pin = driver?.["pickupPin"] as { required?: unknown; maxAttempts?: unknown; lockMinutes?: unknown } | undefined;
  if (pin && typeof pin === "object") {
    const whole = (value: unknown, min: number, max: number, fallback: number) => (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback);
    zone.pickupPin = { required: pin.required === true, maxAttempts: whole(pin.maxAttempts, 1, 10, zone.pickupPin.maxAttempts), lockMinutes: whole(pin.lockMinutes, 1, 60, zone.pickupPin.lockMinutes) };
  }
  // v0.18.9 (G7): the server's ride check, the route change switches and the max stops as the zone's drivers get them.
  const check = driver?.["rideCheck"] as Record<string, unknown> | undefined;
  if (check && typeof check === "object") {
    const n = (key: string, limit: { min: number; max: number }, fallback: number) => (typeof check[key] === "number" && (check[key] as number) >= limit.min && (check[key] as number) <= limit.max ? (check[key] as number) : fallback);
    const b = (key: string, fallback: boolean) => (typeof check[key] === "boolean" ? (check[key] as boolean) : fallback);
    const rc = zone.rideCheck;
    zone.rideCheck = {
      ...rc,
      on: b("on", rc.on), noAnswerAlarm: b("noAnswerAlarm", rc.noAnswerAlarm),
      stopMinutes: n("stopMinutes", RIDE_CHECK_LIMITS.stopMinutes, rc.stopMinutes), routeKm: n("offRouteKm", RIDE_CHECK_LIMITS.routeKm, rc.routeKm),
      endFarMeters: n("endFarMeters", RIDE_CHECK_LIMITS.endFarMeters, rc.endFarMeters), noAnswerSeconds: n("noAnswerSeconds", RIDE_CHECK_LIMITS.noAnswerSeconds, rc.noAnswerSeconds),
      repeatMinutes: n("repeatMinutes", RIDE_CHECK_LIMITS.repeatMinutes, rc.repeatMinutes),
    };
  }
  const change = driver?.["routeChange"] as Record<string, unknown> | undefined;
  if (change && typeof change === "object") {
    const answer = change["answerSeconds"];
    const fixed = change["fixedPriceTrips"];
    zone.stops = {
      ...zone.stops,
      ...(typeof change["on"] === "boolean" && zone.stops.on ? { changeDuring: change["on"] } : {}),
      ...(typeof change["driverCanRefuse"] === "boolean" ? { driverCanRefuse: change["driverCanRefuse"] } : {}),
      ...(typeof answer === "number" && Number.isInteger(answer) && answer >= 15 && answer <= 300 ? { answerSeconds: answer } : {}),
      ...(typeof change["beforePickup"] === "boolean" ? { beforePickup: change["beforePickup"] } : {}),
      ...(fixed === "block" || fixed === "switch_to_normal" ? { fixedPriceTrips: fixed } : {}),
    };
  }
  const maxStops = (driver?.["booking"] as { maxStops?: unknown } | undefined)?.maxStops;
  if (typeof maxStops === "number" && Number.isInteger(maxStops)) {
    if (maxStops === 0) zone.stops = { ...zone.stops, on: false };
    else if (maxStops >= 1 && maxStops <= 5) zone.stops = { ...zone.stops, on: true, max: maxStops };
  }
  return zone;
}

/* ---------------------------------------------------------------- app documents */

/** The parts of the rider and driver documents each admin page owns; publishing a page writes only its parts. */
export const OWNED: Record<"dispatch" | "settings" | "content", { rider: string[]; driver: string[] }> = {
  dispatch: { rider: ["booking", "cancelFees", "cancelCheck", "cancelReasons"], driver: ["booking", "offers", "cancelFees", "waiting", "pickupPin", "destinationMode", "nextTrips", "reservations", "cancelReasons", "drivingLimits", "rideCheck", "routeChange"] },
  settings: { rider: ["features", "appUpdate"], driver: ["features", "appUpdate"] },
  content: { rider: [], driver: ["texts", "notices"] },
};

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
      next["waiting"] = { ...own, driverSharePct: made["driverSharePct"], driverShareWaitPct: made["driverShareWaitPct"], cancelAfterArrivedIsNoShow: made["cancelAfterArrivedIsNoShow"], farPickup: made["farPickup"], rideTypes: made["rideTypes"], stopFreeWaitMin: made["stopFreeWaitMin"] };
      continue;
    }
    next[key] = structuredClone(built[key]);
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

export type CountryRulesInput = { tips: number[]; raiseSteps: number[]; driverBonus: { defaultLimit: number; hardMax: number } };

/** CountryRules (CONTRACT.md §6.5) from the Tips & limits panel's values (major units). */
export function countryRulesOf(country: string, currency: CurrencyCode, input: CountryRulesInput, base: Doc | null): Doc {
  const option = (amount: number) => ({ amount: toMinor(amount, currency), enabled: true });
  return {
    version: (base?.["version"] as number | undefined) ?? 1,
    publishedAt: (base?.["publishedAt"] as string | undefined) ?? new Date(0).toISOString(),
    country,
    currency,
    tips: input.tips.map(option),
    raiseSteps: input.raiseSteps.map(option),
    driverBonus: { defaultLimit: toMinor(input.driverBonus.defaultLimit, currency), hardMax: toMinor(input.driverBonus.hardMax, currency) },
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
 * already has the same live document. A 409 becomes SettingsChanged.
 */
export async function savePublish(http: ConfigHttp, doc: ConfigDocName, id: string, draft: Draft | null, document: Doc): Promise<{ version: number } | null> {
  if (draft && draft.liveVersion > 0 && !draft.usesStandard && sameDocument(draft.document, document)) return null;
  const scope = scopeOf(id);
  try {
    const saved = await http.put<Draft>(`/admin/config/${doc}`, { expectedVersion: draft?.version ?? 1, ...scope, document });
    return await http.post<{ version: number }>(`/admin/config/${doc}/publish`, { expectedVersion: saved.version, ...scope });
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
export async function savePublishLive(http: ConfigHttp, doc: ConfigDocName, id: string, draft: Draft | null, document: Doc, live: Doc | null | undefined): Promise<{ version: number } | null> {
  if (draft && draft.liveVersion > 0 && !draft.usesStandard) {
    if (live && sameDocument(live, document)) return null;
    if (live === undefined && draft.version <= 1 && sameDocument(draft.document, document)) return null;
  }
  // The skip is decided above; savePublish only takes the draft's version from here.
  return savePublish(http, doc, id, draft ? { ...draft, liveVersion: 0 } : null, document);
}

const META_KEYS = new Set(["version", "publishedAt", "usesStandard"]);

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
